/**
 * WS10 / N3 — DB-free tests for the PS ENVI -> AQM outbox + payload + drainer.
 *
 * Coverage:
 *  (a) AQM-type gating (env allowlist)
 *  (b) payload built from EMPLOYER with normalized NIP + gdriveFolderUrl from GdFolderId
 *  (c) enqueue writes via the SAME tx conn
 *  (d) drain success -> SENT
 *  (e) drain failure -> FAILED + Attempts++ + LastError
 *  (f) a simulated push throw does NOT propagate out of deliverOutboxRow
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../tools/ToolsDb');

import ToolsDb from '../../../tools/ToolsDb';
import {
    normalizeNip,
    isAqmContractType,
    buildAqmPayload,
    enqueueAqmPush,
    deliverOutboxRow,
    drainAqmOutbox,
} from '../AqmSync';

const baseContract = (overrides: any = {}) => ({
    id: 4567,
    typeId: 10,
    startDate: '2026-06-01',
    endDate: '2027-05-31',
    gdFolderId: 'FOLDER_ABC123',
    _employers: [
        {
            id: 123,
            name: 'PWiK Sp. z o.o.',
            taxNumber: '747-191-75-75',
            address: 'ul. Wodna 1, 00-000 Miasto',
        },
    ],
    ...overrides,
});

describe('normalizeNip', () => {
    it('strips all non-digits (parity with KSeF validator)', () => {
        expect(normalizeNip('747-191-75-75')).toBe('7471917575');
        expect(normalizeNip('123 456 78 90')).toBe('1234567890');
        expect(normalizeNip('7471917575')).toBe('7471917575');
        expect(normalizeNip(undefined)).toBe('');
        expect(normalizeNip(null)).toBe('');
    });
});

describe('isAqmContractType (env allowlist)', () => {
    const ORIG = process.env.AQM_SYNC_CONTRACT_TYPE_IDS;
    beforeEach(() => {
        delete process.env.AQM_SYNC_CONTRACT_TYPE_IDS;
    });
    afterAll(() => {
        if (ORIG === undefined) delete process.env.AQM_SYNC_CONTRACT_TYPE_IDS;
        else process.env.AQM_SYNC_CONTRACT_TYPE_IDS = ORIG;
    });

    it('defaults to [10] when env unset → 10 is AQM, others are not', () => {
        expect(isAqmContractType(10)).toBe(true);
        expect(isAqmContractType(11)).toBe(false);
        expect(isAqmContractType(undefined)).toBe(false);
    });

    it('respects CSV allowlist from env', () => {
        process.env.AQM_SYNC_CONTRACT_TYPE_IDS = '10, 11';
        expect(isAqmContractType(10)).toBe(true);
        expect(isAqmContractType(11)).toBe(true);
        expect(isAqmContractType(12)).toBe(false);
    });
});

describe('buildAqmPayload (from EMPLOYER)', () => {
    it('builds entity from _employers[0] with normalized NIP and gdrive URL from GdFolderId', () => {
        const payload = buildAqmPayload(baseContract() as any);
        expect(payload.entity).toEqual({
            legacyEntityId: 123,
            name: 'PWiK Sp. z o.o.',
            taxNr: '7471917575',
            address: 'ul. Wodna 1, 00-000 Miasto',
        });
        expect(payload.contract).toEqual({
            legacyContractId: 4567,
            startDate: '2026-06-01',
            endDate: '2027-05-31',
            gdriveFolderUrl:
                'https://drive.google.com/drive/folders/FOLDER_ABC123',
        });
    });

    it('leaves gdriveFolderUrl undefined when GdFolderId is empty', () => {
        const payload = buildAqmPayload(
            baseContract({ gdFolderId: undefined }) as any
        );
        expect(payload.contract.gdriveFolderUrl).toBeUndefined();
    });

    it('throws when there is no employer', () => {
        expect(() =>
            buildAqmPayload(baseContract({ _employers: [] }) as any)
        ).toThrow();
    });
});

describe('enqueueAqmPush (same tx conn)', () => {
    it('inserts a PENDING outbox row via the provided connection and returns insertId', async () => {
        const conn: any = {
            execute: jest
                .fn<any>()
                .mockResolvedValue([{ insertId: 999 }, undefined]),
        };
        const id = await enqueueAqmPush(baseContract() as any, conn);
        expect(id).toBe(999);
        expect(conn.execute).toHaveBeenCalledTimes(1);
        const [sql, params] = conn.execute.mock.calls[0];
        expect(sql).toContain('INSERT INTO AqmSyncOutbox');
        expect(sql).toContain("'PENDING'");
        // ContractId, then JSON payload
        expect(params[0]).toBe(4567);
        const parsed = JSON.parse(params[1]);
        expect(parsed.entity.taxNr).toBe('7471917575');
        expect(parsed.contract.gdriveFolderUrl).toContain('FOLDER_ABC123');
    });
});

describe('deliverOutboxRow', () => {
    const ORIG_BASE = process.env.AQM_SYNC_BASE_URL;
    beforeEach(() => {
        process.env.AQM_SYNC_BASE_URL = 'https://aqm.example';
        process.env.AQM_SYNC_TOKEN = 'tok';
        (ToolsDb.executeSQL as jest.Mock).mockReset();
        (ToolsDb.executeSQL as any).mockResolvedValue({});
    });
    afterAll(() => {
        if (ORIG_BASE === undefined) delete process.env.AQM_SYNC_BASE_URL;
        else process.env.AQM_SYNC_BASE_URL = ORIG_BASE;
    });

    const row = {
        Id: 1,
        ContractId: 4567,
        Payload: { entity: { taxNr: '7471917575' }, contract: {} },
        Status: 'PENDING' as const,
        Attempts: 0,
    };

    it('200 → marks row SENT', async () => {
        (global as any).fetch = jest
            .fn<any>()
            .mockResolvedValue({ status: 200, text: async () => '' });

        const result = await deliverOutboxRow(row);
        expect(result).toBe('SENT');
        const [sql, params] = (ToolsDb.executeSQL as jest.Mock).mock
            .calls[0] as any;
        expect(sql).toContain("Status = 'SENT'");
        expect(params).toContain(1);
    });

    it('non-200 → marks FAILED + Attempts++ + LastError', async () => {
        (global as any).fetch = jest.fn<any>().mockResolvedValue({
            status: 500,
            statusText: 'Server Error',
            text: async () => 'boom',
        });

        const result = await deliverOutboxRow(row);
        expect(result).toBe('FAILED');
        const [sql, params] = (ToolsDb.executeSQL as jest.Mock).mock
            .calls[0] as any;
        expect(sql).toContain("Status = 'FAILED'");
        expect(sql).toContain('Attempts = Attempts + 1');
        expect(String(params[0])).toContain('500');
    });

    it('network throw → does NOT propagate, records FAILED', async () => {
        (global as any).fetch = jest
            .fn<any>()
            .mockRejectedValue(new Error('ECONNREFUSED'));

        // Must resolve, never throw.
        const result = await deliverOutboxRow(row);
        expect(result).toBe('FAILED');
        const [sql, params] = (ToolsDb.executeSQL as jest.Mock).mock
            .calls[0] as any;
        expect(sql).toContain("Status = 'FAILED'");
        expect(String(params[0])).toContain('ECONNREFUSED');
    });
});

describe('drainAqmOutbox', () => {
    beforeEach(() => {
        process.env.AQM_SYNC_BASE_URL = 'https://aqm.example';
        process.env.AQM_SYNC_TOKEN = 'tok';
        (ToolsDb.getQueryCallbackAsync as jest.Mock).mockReset();
        (ToolsDb.executeSQL as jest.Mock).mockReset();
        (ToolsDb.executeSQL as any).mockResolvedValue({});
    });

    it('re-sends PENDING/FAILED rows and summarizes results', async () => {
        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([
            {
                Id: 1,
                ContractId: 1,
                Payload: { entity: {}, contract: {} },
                Status: 'PENDING',
                Attempts: 0,
            },
            {
                Id: 2,
                ContractId: 2,
                Payload: { entity: {}, contract: {} },
                Status: 'FAILED',
                Attempts: 3,
            },
        ]);
        (global as any).fetch = jest
            .fn<any>()
            .mockResolvedValueOnce({ status: 200, text: async () => '' })
            .mockResolvedValueOnce({
                status: 502,
                statusText: 'Bad Gateway',
                text: async () => '',
            });

        const summary = await drainAqmOutbox();
        expect(summary).toEqual({ processed: 2, sent: 1, failed: 1 });
    });

    it('never throws even if the query layer throws', async () => {
        (ToolsDb.getQueryCallbackAsync as any).mockRejectedValue(
            new Error('db down')
        );
        const summary = await drainAqmOutbox();
        expect(summary).toEqual({ processed: 0, sent: 0, failed: 0 });
    });
});
