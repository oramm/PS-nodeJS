/**
 * SYNC-P2 — DB-free tests for the FIDman sync status read + manual "dopchnij"
 * retry surface (getFidmanContractSyncStatus / retryFidmanContractSync /
 * fidmanSkipReasonLabel). Modeled on ../FidmanSync.test.ts (mocked ToolsDb).
 *
 * Coverage (anti-makieta DoD):
 *  - status read returns the right status for PENDING / SENT / FAILED / SKIPPED
 *    (and NONE when the contract was never enqueued).
 *  - a SKIPPED row (NEEDS_DATA / NO_NIP) surfaces the reason AND a human label —
 *    the "awizo braków" the UI shows.
 *  - manual retry: no FAILED/SKIPPED row -> NOT_FOUND, no delivery attempted.
 *  - manual retry: re-delivers the row via the real deliverOutboxRow (not
 *    reimplemented) — a delivery that now succeeds clears the flag (row -> SENT).
 */

import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';

jest.mock('../../../tools/ToolsDb');

import ToolsDb from '../../../tools/ToolsDb';
import {
    getFidmanContractSyncStatus,
    retryFidmanContractSync,
    fidmanSkipReasonLabel,
} from '../FidmanSync';

describe('fidmanSkipReasonLabel', () => {
    it('maps NEEDS_DATA / NO_NIP to a human label, unknown reasons to a fallback, null to null', () => {
        expect(fidmanSkipReasonLabel('NEEDS_DATA')).toMatch(/dan/i);
        expect(fidmanSkipReasonLabel('NO_NIP')).toMatch(/NIP/);
        expect(fidmanSkipReasonLabel('WEIRD_REASON')).toContain('WEIRD_REASON');
        expect(fidmanSkipReasonLabel(null)).toBeNull();
    });
});

describe('getFidmanContractSyncStatus', () => {
    beforeEach(() => {
        (ToolsDb.getQueryCallbackAsync as any).mockReset();
    });

    it('no outbox row -> NONE', async () => {
        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([]);
        const status = await getFidmanContractSyncStatus(1);
        expect(status).toMatchObject({
            contractId: 1,
            kind: 'contract.upsert',
            status: 'NONE',
            skipReason: null,
            lastError: null,
        });
    });

    it.each(['PENDING', 'SENT', 'FAILED', 'SKIPPED'] as const)(
        'reports %s from the latest row (queries by Kind + RefId, most recent first)',
        async (dbStatus) => {
            (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([
                {
                    Id: 42,
                    Status: dbStatus,
                    SkipReason: dbStatus === 'SKIPPED' ? 'NEEDS_DATA' : null,
                    LastError: dbStatus === 'FAILED' ? 'HTTP 500' : null,
                    Attempts: dbStatus === 'FAILED' ? 3 : 0,
                    UpdatedAt: '2026-07-11T10:00:00.000Z',
                },
            ]);

            const status = await getFidmanContractSyncStatus(123);
            expect(status.status).toBe(dbStatus);

            const [sql, , params] = (
                ToolsDb.getQueryCallbackAsync as any
            ).mock.calls[0] as any;
            expect(sql).toContain("Kind = 'contract.upsert'");
            expect(sql).toContain('ORDER BY Id DESC');
            expect(params).toEqual([123]);
        }
    );

    it('SKIPPED + NEEDS_DATA -> reason and label describe what is missing', async () => {
        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([
            {
                Id: 1,
                Status: 'SKIPPED',
                SkipReason: 'NEEDS_DATA',
                LastError: null,
                Attempts: 0,
                UpdatedAt: '2026-07-11',
            },
        ]);
        const status = await getFidmanContractSyncStatus(5);
        expect(status.skipReason).toBe('NEEDS_DATA');
        expect(status.skipReasonLabel).toBeTruthy();
    });

    it('SKIPPED + NO_NIP -> reason and label mention the missing NIP', async () => {
        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([
            {
                Id: 2,
                Status: 'SKIPPED',
                SkipReason: 'NO_NIP',
                LastError: null,
                Attempts: 0,
                UpdatedAt: '2026-07-11',
            },
        ]);
        const status = await getFidmanContractSyncStatus(6);
        expect(status.skipReason).toBe('NO_NIP');
        expect(status.skipReasonLabel).toMatch(/NIP/);
    });
});

describe('retryFidmanContractSync ("dopchnij synchronizację")', () => {
    const ORIG_BASE = process.env.FIDMAN_SYNC_BASE_URL;
    beforeEach(() => {
        process.env.FIDMAN_SYNC_BASE_URL = 'https://fidman.example';
        process.env.FIDMAN_SYNC_TOKEN = 'tok';
        (ToolsDb.getQueryCallbackAsync as any).mockReset();
        (ToolsDb.executeSQL as any).mockReset();
    });
    afterAll(() => {
        if (ORIG_BASE === undefined) delete process.env.FIDMAN_SYNC_BASE_URL;
        else process.env.FIDMAN_SYNC_BASE_URL = ORIG_BASE;
    });

    it('no FAILED/SKIPPED row for the contract -> NOT_FOUND, no HTTP call made', async () => {
        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([]);
        (global as any).fetch = jest.fn();

        const result = await retryFidmanContractSync(999);
        expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
        expect((global as any).fetch).not.toHaveBeenCalled();
    });

    it('re-delivers the FAILED row via deliverOutboxRow; success clears the flag (row -> SENT)', async () => {
        // Stateful mock: markFailed/markSent in the real deliverOutboxRow mutate
        // this via ToolsDb.executeSQL; the final status read must reflect it —
        // this is red-without-fix if retry doesn't actually re-deliver+re-read.
        let outboxStatus: 'FAILED' | 'SENT' = 'FAILED';
        const OUTBOX_ID = 77;
        const CONTRACT_ID = 42;

        (ToolsDb.getQueryCallbackAsync as any).mockImplementation(
            async (sql: any) => {
                if (sql.includes("Status IN ('FAILED', 'SKIPPED')")) {
                    return outboxStatus === 'FAILED'
                        ? [
                              {
                                  Id: OUTBOX_ID,
                                  Kind: 'contract.upsert',
                                  RefId: CONTRACT_ID,
                                  Payload: {
                                      legacyContractId: CONTRACT_ID,
                                      entities: [],
                                  },
                                  Status: 'FAILED',
                                  Attempts: 2,
                                  SkipReason: null,
                              },
                          ]
                        : [];
                }
                // Final status re-read (Kind + RefId, no Status filter).
                return [
                    {
                        Id: OUTBOX_ID,
                        Status: outboxStatus,
                        SkipReason: null,
                        LastError: outboxStatus === 'SENT' ? null : 'HTTP 500',
                        Attempts: 2,
                        UpdatedAt: '2026-07-11',
                    },
                ];
            }
        );
        (ToolsDb.executeSQL as any).mockImplementation(
            async (sql: any) => {
                if (sql.includes("Status = 'SENT'")) outboxStatus = 'SENT';
                return {};
            }
        );
        (global as any).fetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            json: async () => ({ created: 0, updated: 1, skipped: [] }),
            text: async () => '',
        });

        const result = await retryFidmanContractSync(CONTRACT_ID);

        expect((global as any).fetch).toHaveBeenCalledTimes(1); // actually re-delivered
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.status.status).toBe('SENT');
            expect(result.status.lastError).toBeNull();
        }
    });
});
