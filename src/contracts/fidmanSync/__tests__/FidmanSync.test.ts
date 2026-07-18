/**
 * SYNC-P1 — DB-free tests for the PS ENVI -> FIDman outbox + payload + drainer.
 * Modeled verbatim on ../../aqmSync/__tests__/AqmSync.test.ts (mocked ToolsDb).
 *
 * Coverage:
 *  (a) FIDman-type gating (env allowlist, default [3,4]) — type-filter guard
 *  (b) contract.upsert payload: contract + inline project ref + entities-with-roles
 *  (c) entity.upsert / project.upsert payloads
 *  (d) enqueue writes via the SAME tx conn (INSERT INTO FidmanSyncOutbox)
 *  (e) deliver 200 -> SENT
 *  (f) deliver 200 + skipped:NEEDS_DATA -> SKIPPED + SkipReason (not a failure)
 *  (g) deliver non-200 / thrown -> FAILED + Attempts++ + LastError (never propagates)
 *  (h) party/parent guards (entityHasSyncedContract / projectHasSyncedContract)
 */

import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';

jest.mock('../../../tools/ToolsDb');

import ToolsDb from '../../../tools/ToolsDb';
import {
    isFidmanContractType,
    buildContractPayload,
    buildEntityUpsert,
    buildProjectUpsert,
    enqueueFidmanContractPush,
    deliverOutboxRow,
    drainFidmanOutbox,
    entityHasSyncedContract,
    projectHasSyncedContract,
} from '../FidmanSync';

const baseContract = (overrides: any = {}) => ({
    id: 4567,
    typeId: 3,
    number: 'UM/001',
    name: 'Umowa FIDman',
    startDate: '2026-06-01',
    endDate: '2027-05-31',
    _project: { id: 88, ourId: 'PRJ-001', name: 'Projekt', comment: 'opis' },
    _employers: [
        {
            id: 123,
            name: 'PWiK Sp. z o.o.',
            taxNumber: '7471917575',
            www: 'https://pwik.pl',
            email: 'biuro@pwik.pl',
            phone: '111222333',
        },
    ],
    _engineers: [{ id: 200, name: 'Inżynier', taxNumber: null }],
    _contractors: [],
    ...overrides,
});

describe('isFidmanContractType (env allowlist — type filter)', () => {
    const ORIG = process.env.FIDMAN_SYNC_CONTRACT_TYPE_IDS;
    beforeEach(() => {
        delete process.env.FIDMAN_SYNC_CONTRACT_TYPE_IDS;
    });
    afterAll(() => {
        if (ORIG === undefined) delete process.env.FIDMAN_SYNC_CONTRACT_TYPE_IDS;
        else process.env.FIDMAN_SYNC_CONTRACT_TYPE_IDS = ORIG;
    });

    it('defaults to [3,4] → 3 and 4 sync, others (e.g. 5) do NOT', () => {
        expect(isFidmanContractType(3)).toBe(true);
        expect(isFidmanContractType(4)).toBe(true);
        expect(isFidmanContractType(5)).toBe(false);
        expect(isFidmanContractType(10)).toBe(false);
        expect(isFidmanContractType(undefined)).toBe(false);
    });

    it('respects CSV allowlist from env', () => {
        process.env.FIDMAN_SYNC_CONTRACT_TYPE_IDS = '3, 4, 7';
        expect(isFidmanContractType(7)).toBe(true);
        expect(isFidmanContractType(5)).toBe(false);
    });
});

describe('buildContractPayload (contract.upsert)', () => {
    it('builds contract + inline project ref + entities-with-roles', () => {
        const env = buildContractPayload(baseContract() as any);
        expect(env.kind).toBe('contract.upsert');
        const p = env.payload as any;
        expect(p).toMatchObject({
            legacyContractId: 4567,
            number: 'UM/001',
            name: 'Umowa FIDman',
            startDate: '2026-06-01',
            endDate: '2027-05-31',
        });
        // R7-P1: the inline project ref MUST carry the real project name (not just the
        // natural key), otherwise FIDman's `p.name ?? p.ourId` insert fallback seeds
        // projects.name = ourId (the "Nazwa == Numer" bug). ourId-only ref = the bug.
        expect(p.project).toEqual({
            legacyProjectId: 88,
            ourId: 'PRJ-001',
            name: 'Projekt',
        });
        expect(p.entities).toEqual([
            {
                legacyEntityId: 123,
                name: 'PWiK Sp. z o.o.',
                taxNumber: '7471917575',
                www: 'https://pwik.pl',
                email: 'biuro@pwik.pl',
                phone: '111222333',
                address: undefined,
                role: 'EMPLOYER',
            },
            {
                legacyEntityId: 200,
                name: 'Inżynier',
                taxNumber: null, // sent even when null — FIDman decides NO_NIP
                www: undefined,
                email: undefined,
                phone: undefined,
                address: undefined,
                role: 'ENGINEER',
            },
        ]);
    });

    it('missing StartDate/EndDate → null (FIDman handles it)', () => {
        const env = buildContractPayload(
            baseContract({ startDate: undefined, endDate: null }) as any
        );
        expect((env.payload as any).startDate).toBeNull();
        expect((env.payload as any).endDate).toBeNull();
    });
});

describe('buildEntityUpsert / buildProjectUpsert', () => {
    it('entity.upsert carries source-owned fields + null taxNumber', () => {
        const env = buildEntityUpsert({
            id: 9,
            name: 'ACME',
            taxNumber: undefined,
            www: 'https://acme.pl',
        } as any);
        expect(env.kind).toBe('entity.upsert');
        expect(env.payload).toEqual({
            legacyEntityId: 9,
            name: 'ACME',
            taxNumber: null,
            www: 'https://acme.pl',
            email: undefined,
            phone: undefined,
            address: undefined,
        });
    });

    it('project.upsert maps OurId→ourId, Comment→comment', () => {
        const env = buildProjectUpsert({
            id: 5,
            ourId: 'PRJ-9',
            name: 'Nowy',
            comment: 'komentarz',
        } as any);
        expect(env.kind).toBe('project.upsert');
        expect(env.payload).toEqual({
            legacyProjectId: 5,
            ourId: 'PRJ-9',
            name: 'Nowy',
            comment: 'komentarz',
        });
    });
});

describe('enqueueFidmanContractPush (same tx conn)', () => {
    it('inserts a PENDING row via the provided connection and returns insertId', async () => {
        const conn: any = {
            execute: jest
                .fn<any>()
                .mockResolvedValue([{ insertId: 999 }, undefined]),
        };
        const id = await enqueueFidmanContractPush(baseContract() as any, conn);
        expect(id).toBe(999);
        expect(conn.execute).toHaveBeenCalledTimes(1);
        const [sql, params] = conn.execute.mock.calls[0];
        expect(sql).toContain('INSERT INTO FidmanSyncOutbox');
        expect(sql).toContain("'PENDING'");
        expect(params[0]).toBe('contract.upsert'); // Kind
        expect(params[1]).toBe(4567); // RefId = Contract PK
        const parsed = JSON.parse(params[2]);
        expect(parsed.entities[0].taxNumber).toBe('7471917575');
        expect(parsed.project.ourId).toBe('PRJ-001');
    });
});

describe('deliverOutboxRow', () => {
    const ORIG_BASE = process.env.FIDMAN_SYNC_BASE_URL;
    beforeEach(() => {
        process.env.FIDMAN_SYNC_BASE_URL = 'https://fidman.example';
        process.env.FIDMAN_SYNC_TOKEN = 'tok';
        (ToolsDb.executeSQL as jest.Mock).mockReset();
        (ToolsDb.executeSQL as any).mockResolvedValue({});
    });
    afterAll(() => {
        if (ORIG_BASE === undefined) delete process.env.FIDMAN_SYNC_BASE_URL;
        else process.env.FIDMAN_SYNC_BASE_URL = ORIG_BASE;
    });

    const row = {
        Id: 1,
        Kind: 'contract.upsert' as const,
        RefId: 4567,
        Payload: { legacyContractId: 4567, entities: [] },
        Status: 'PENDING' as const,
        Attempts: 0,
        SkipReason: null,
    };

    it('200 + no skip → marks row SENT (posts {kind,payload} to /api/ps-sync)', async () => {
        const fetchMock = jest
            .fn<any>()
            .mockResolvedValue({
                status: 200,
                json: async () => ({ created: 1, updated: 0, skipped: [] }),
                text: async () => '',
            });
        (global as any).fetch = fetchMock;

        const result = await deliverOutboxRow(row);
        expect(result).toBe('SENT');
        // Body carries { kind, payload }; URL hits the FIDman ingest path.
        const [url, opts] = fetchMock.mock.calls[0] as [string, any];
        expect(String(url)).toContain('/api/ps-sync');
        expect(JSON.parse(opts.body).kind).toBe('contract.upsert');
        expect(opts.headers.Authorization).toBe('Bearer tok');
        const [sql] = (ToolsDb.executeSQL as jest.Mock).mock.calls[0] as any;
        expect(sql).toContain("Status = 'SENT'");
    });

    it('DM-L1: 200 contract.upsert with contractId → writes FidmanContractId (no-clobber)', async () => {
        (global as any).fetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            json: async () => ({ created: 1, updated: 0, contractId: 8813, skipped: [] }),
            text: async () => '',
        });

        const result = await deliverOutboxRow(row);
        expect(result).toBe('SENT');
        // A Contracts UPDATE persists FIDman's id onto the PS row (RefId = PS Contracts.Id).
        const calls = (ToolsDb.executeSQL as jest.Mock).mock.calls as any[];
        const linkCall = calls.find(([sql]) => /UPDATE Contracts SET FidmanContractId/.test(sql));
        expect(linkCall).toBeDefined();
        const [linkSql, linkParams] = linkCall;
        expect(linkSql).toContain('FidmanContractId IS NULL'); // no-clobber
        expect(linkParams).toEqual([8813, row.RefId]);
    });

    it('200 + skipped NEEDS_DATA → marks row SKIPPED + SkipReason (not a failure)', async () => {
        (global as any).fetch = jest.fn<any>().mockResolvedValue({
            status: 200,
            json: async () => ({
                created: 0,
                updated: 0,
                skipped: [{ legacyEntityId: 200, reason: 'NEEDS_DATA' }],
            }),
            text: async () => '',
        });

        const result = await deliverOutboxRow(row);
        expect(result).toBe('SKIPPED');
        const [sql, params] = (ToolsDb.executeSQL as jest.Mock).mock
            .calls[0] as any;
        expect(sql).toContain("Status = 'SKIPPED'");
        expect(sql).toContain('SkipReason = ?');
        expect(params).toContain('NEEDS_DATA');
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

        const result = await deliverOutboxRow(row);
        expect(result).toBe('FAILED');
        const [sql, params] = (ToolsDb.executeSQL as jest.Mock).mock
            .calls[0] as any;
        expect(sql).toContain("Status = 'FAILED'");
        expect(String(params[0])).toContain('ECONNREFUSED');
    });
});

describe('party/parent guards', () => {
    beforeEach(() => {
        (ToolsDb.getQueryCallbackAsync as jest.Mock).mockReset();
    });

    it('entityHasSyncedContract: row present → true, empty → false, null id → false (no query)', async () => {
        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValueOnce([{ '1': 1 }]);
        expect(await entityHasSyncedContract(123)).toBe(true);

        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValueOnce([]);
        expect(await entityHasSyncedContract(123)).toBe(false);

        (ToolsDb.getQueryCallbackAsync as jest.Mock).mockClear();
        expect(await entityHasSyncedContract(undefined)).toBe(false);
        expect(ToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
    });

    it('projectHasSyncedContract: row present → true, empty → false', async () => {
        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValueOnce([{ '1': 1 }]);
        expect(await projectHasSyncedContract('PRJ-001')).toBe(true);

        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValueOnce([]);
        expect(await projectHasSyncedContract('PRJ-001')).toBe(false);
    });
});

describe('drainFidmanOutbox', () => {
    beforeEach(() => {
        process.env.FIDMAN_SYNC_BASE_URL = 'https://fidman.example';
        process.env.FIDMAN_SYNC_TOKEN = 'tok';
        (ToolsDb.getQueryCallbackAsync as jest.Mock).mockReset();
        (ToolsDb.executeSQL as jest.Mock).mockReset();
        (ToolsDb.executeSQL as any).mockResolvedValue({});
    });

    it('re-sends PENDING/FAILED rows and summarizes SENT/FAILED/SKIPPED', async () => {
        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([
            {
                Id: 1,
                Kind: 'contract.upsert',
                RefId: 1,
                Payload: { entities: [] },
                Status: 'PENDING',
                Attempts: 0,
                SkipReason: null,
            },
            {
                Id: 2,
                Kind: 'entity.upsert',
                RefId: 2,
                Payload: {},
                Status: 'FAILED',
                Attempts: 3,
                SkipReason: null,
            },
        ]);
        (global as any).fetch = jest
            .fn<any>()
            .mockResolvedValueOnce({
                status: 200,
                json: async () => ({ created: 1, skipped: [] }),
                text: async () => '',
            })
            .mockResolvedValueOnce({
                status: 502,
                statusText: 'Bad Gateway',
                text: async () => '',
            });

        const summary = await drainFidmanOutbox();
        expect(summary).toEqual({
            processed: 2,
            sent: 1,
            failed: 1,
            skipped: 0,
        });
    });

    it('never throws even if the query layer throws', async () => {
        (ToolsDb.getQueryCallbackAsync as any).mockRejectedValue(
            new Error('db down')
        );
        const summary = await drainFidmanOutbox();
        expect(summary).toEqual({
            processed: 0,
            sent: 0,
            failed: 0,
            skipped: 0,
        });
    });
});
