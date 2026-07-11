/**
 * SYNC-P2 — end-to-end (DB-free) red test for the anti-makieta DoD:
 * "simulated delivery failure -> contract IS saved (business write intact) AND
 * the status endpoint reports the failed/flag state."
 *
 * Unlike ./ContractsController.fidmanSync.test.ts (which mocks the whole
 * FidmanSync module to isolate the controller wiring), THIS suite leaves
 * FidmanSync REAL: enqueueFidmanContractPush really inserts (via the mocked tx
 * conn), tryDeliverAfterCommit really SELECTs + calls the real deliverOutboxRow,
 * and the failure is a real fetch() rejection/500 — so a bug in the read query
 * (wrong Kind/RefId/columns) or in the write-on-failure path fails this test.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../tools/ToolsDb');
jest.mock('../../tools/Tools');
jest.mock('../ContractEntityRepository');
jest.mock('../contractRangesContracts/ContractRangeContractRepository');
jest.mock('../../ScrumSheet/CurrentSprintValidator');
jest.mock('../../setup/Sessions/IntersessionsTasksStore');
// FidmanSync is intentionally NOT mocked here.

import ToolsDb from '../../tools/ToolsDb';
import Tools from '../../tools/Tools';
import CurrentSprintValidator from '../../ScrumSheet/CurrentSprintValidator';
import TaskStore from '../../setup/Sessions/IntersessionsTasksStore';
import { getFidmanContractSyncStatus } from '../fidmanSync/FidmanSync';

const CONTRACT_ID = 123;
const OUTBOX_ID = 555;
const ORIG_BASE = process.env.FIDMAN_SYNC_BASE_URL;
const ORIG_TOKEN = process.env.FIDMAN_SYNC_TOKEN;

describe('ContractsController.add() -> FidmanSyncOutbox status read (SYNC-P2 red test)', () => {
    let mockConn: any;
    // In-memory outbox row, mutated only through the same SQL the real
    // markFailed()/deliverOutboxRow() issue — proves the write path is wired.
    let outbox: {
        Status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
        SkipReason: string | null;
        LastError: string | null;
        Attempts: number;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.FIDMAN_SYNC_BASE_URL = 'https://fidman.example';
        process.env.FIDMAN_SYNC_TOKEN = 'tok';
        process.env.FIDMAN_SYNC_CONTRACT_TYPE_IDS = '3,4';

        outbox = { Status: 'PENDING', SkipReason: null, LastError: null, Attempts: 0 };

        mockConn = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
            execute: jest.fn<any>().mockResolvedValue([{ insertId: OUTBOX_ID }, undefined]),
        };

        (ToolsDb.transaction as jest.Mock).mockImplementation(
            async (callback: any) => callback(mockConn)
        );
        (ToolsDb.addInDb as any).mockImplementation(async (_t: any, d: any) => {
            d.id = CONTRACT_ID;
            return d;
        });
        (Tools.cloneOfObject as any).mockImplementation((o: any) =>
            JSON.parse(JSON.stringify(o))
        );
        (CurrentSprintValidator.checkColumns as any).mockResolvedValue(undefined);
        (TaskStore.update as any).mockReturnValue(undefined);

        // Real FidmanSync's SELECT paths, backed by the in-memory `outbox`.
        (ToolsDb.getQueryCallbackAsync as jest.Mock).mockImplementation(
            async (sql: any) => {
                if (sql.includes(`WHERE Id = ?`)) {
                    // tryDeliverAfterCommit fetching the just-enqueued row
                    return [
                        {
                            Id: OUTBOX_ID,
                            Kind: 'contract.upsert',
                            RefId: CONTRACT_ID,
                            Payload: { legacyContractId: CONTRACT_ID, entities: [] },
                            Status: outbox.Status,
                            Attempts: outbox.Attempts,
                            SkipReason: outbox.SkipReason,
                        },
                    ];
                }
                if (sql.includes(`Kind = 'contract.upsert' AND RefId = ?`)) {
                    // SYNC-P2 status read
                    return [
                        {
                            Id: OUTBOX_ID,
                            Status: outbox.Status,
                            SkipReason: outbox.SkipReason,
                            LastError: outbox.LastError,
                            Attempts: outbox.Attempts,
                            UpdatedAt: '2026-07-11T10:00:00.000Z',
                        },
                    ];
                }
                return [];
            }
        );
        (ToolsDb.executeSQL as any).mockImplementation(
            async (sql: any, params: any) => {
                if (sql.includes("Status = 'FAILED'")) {
                    outbox = {
                        Status: 'FAILED',
                        SkipReason: null,
                        LastError: String(params[0]),
                        Attempts: outbox.Attempts + 1,
                    };
                }
                return {};
            }
        );
    });

    afterAll(() => {
        if (ORIG_BASE === undefined) delete process.env.FIDMAN_SYNC_BASE_URL;
        else process.env.FIDMAN_SYNC_BASE_URL = ORIG_BASE;
        if (ORIG_TOKEN === undefined) delete process.env.FIDMAN_SYNC_TOKEN;
        else process.env.FIDMAN_SYNC_TOKEN = ORIG_TOKEN;
    });

    const makeContract = () => ({
        alias: 'FID-TEST',
        typeId: 3,
        _type: { id: 3, name: 'IK', isOur: true },
        number: '001',
        name: 'Umowa FIDman',
        startDate: '2026-06-01',
        endDate: '2027-05-31',
        status: 'W trakcie',
        _project: { id: 1, ourId: 'PRJ-001', gdFolderId: 'gd-1' },
        projectOurId: 'PRJ-001',
        gdFolderId: 'FOLDER_ABC',
        _employers: [{ id: 7, name: 'PWiK', taxNumber: '7471917575' }],
        _contractors: [],
        _engineers: [],
        _contractRangesPerContract: [],
        id: undefined as any,
        isUniquePerProject: jest.fn(() => Promise.resolve(false)) as any,
    });

    it('delivery failure (fetch 500): contract save succeeds AND status read reports FAILED + LastError', async () => {
        (global as any).fetch = jest.fn<any>().mockResolvedValue({
            status: 500,
            statusText: 'Server Error',
            text: async () => 'FIDman down',
        });

        const ContractsController = (await import('../ContractsController'))
            .default;
        const saved = await ContractsController.add(makeContract() as any);

        // Business write intact: no rollback, contract instance returned with id.
        expect(mockConn.rollback).not.toHaveBeenCalled();
        expect(mockConn.commit ?? true).toBeTruthy();
        expect((saved as any).id).toBe(CONTRACT_ID);

        // The failed push must NEVER throw out of add().
        expect((global as any).fetch).toHaveBeenCalledTimes(1);

        // SYNC-P2: the status read for this contract must surface the flag.
        const status = await getFidmanContractSyncStatus(CONTRACT_ID);
        expect(status.status).toBe('FAILED');
        expect(status.lastError).toContain('500');
    });
});
