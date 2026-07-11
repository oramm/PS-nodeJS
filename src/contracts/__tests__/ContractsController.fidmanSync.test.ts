/**
 * SYNC-P1 — controller-level integration of the FIDman outbox sync.
 * Modeled on ./ContractsController.aqmSync.test.ts.
 *
 * Coverage:
 *  - FIDman-type contract → outbox row enqueued via the SAME tx conn, then
 *    delivered post-commit (enqueue-in-tx guarantee: red-without-fix if the
 *    enqueue is moved outside the transaction — the captured conn would differ).
 *  - non-synced type (5) → no outbox row, no delivery (type filter).
 *  - L8 GUARANTEE: a post-commit push failure must NEVER throw out of, nor roll
 *    back, the contract transaction (proves a failed delivery leaves PS intact).
 *
 * AqmSync is left REAL here (default allowlist [10] → type 3/5 never trigger AQM),
 * so this test isolates the FIDman path.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../tools/ToolsDb');
jest.mock('../../tools/Tools');
jest.mock('../ContractEntityRepository');
jest.mock('../contractRangesContracts/ContractRangeContractRepository');
jest.mock('../../ScrumSheet/CurrentSprintValidator');
jest.mock('../../setup/Sessions/IntersessionsTasksStore');
// Mock the FidmanSync module so we control gating, enqueue and (failing) delivery.
jest.mock('../fidmanSync/FidmanSync');

import ToolsDb from '../../tools/ToolsDb';
import Tools from '../../tools/Tools';
import CurrentSprintValidator from '../../ScrumSheet/CurrentSprintValidator';
import TaskStore from '../../setup/Sessions/IntersessionsTasksStore';
import * as FidmanSync from '../fidmanSync/FidmanSync';

describe('ContractsController.add() — SYNC-P1 FIDman outbox', () => {
    let mockConn: any;
    let enqueueCalledWithConn: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockConn = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
        };

        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([]);
        (ToolsDb.transaction as jest.Mock).mockImplementation(
            async (callback: any) => callback(mockConn)
        );
        (ToolsDb.addInDb as any).mockImplementation(async (_t: any, d: any) => {
            d.id = 123;
            return d;
        });
        (Tools.cloneOfObject as any).mockImplementation((o: any) =>
            JSON.parse(JSON.stringify(o))
        );
        (CurrentSprintValidator.checkColumns as any).mockResolvedValue(
            undefined
        );
        (TaskStore.update as any).mockReturnValue(undefined);
    });

    const makeContract = (typeId: number) => ({
        alias: 'FID-TEST',
        typeId,
        _type: { id: typeId, name: 'IK', isOur: true },
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

    it('FIDman type → enqueues outbox row using the tx conn, then delivers post-commit', async () => {
        (FidmanSync.isFidmanContractType as jest.Mock).mockReturnValue(true);
        (FidmanSync.enqueueFidmanContractPush as any).mockImplementation(
            async (_c: any, conn: any) => {
                enqueueCalledWithConn = conn;
                return 555;
            }
        );
        (FidmanSync.tryDeliverAfterCommit as any).mockResolvedValue(undefined);

        const ContractsController = (await import('../ContractsController'))
            .default;
        await ContractsController.add(makeContract(3) as any);

        expect(FidmanSync.enqueueFidmanContractPush).toHaveBeenCalledTimes(1);
        // SAME connection as the contract transaction (enqueue-in-tx / L8)
        expect(enqueueCalledWithConn).toBe(mockConn);
        expect(FidmanSync.tryDeliverAfterCommit).toHaveBeenCalledWith(555);
    });

    it('non-synced type (5) → no outbox row, no delivery', async () => {
        (FidmanSync.isFidmanContractType as jest.Mock).mockReturnValue(false);

        const ContractsController = (await import('../ContractsController'))
            .default;
        await ContractsController.add(makeContract(5) as any);

        expect(FidmanSync.enqueueFidmanContractPush).not.toHaveBeenCalled();
        expect(FidmanSync.tryDeliverAfterCommit).not.toHaveBeenCalled();
    });

    it('L8: a post-commit push throw does NOT propagate out of add() nor roll back the contract', async () => {
        (FidmanSync.isFidmanContractType as jest.Mock).mockReturnValue(true);
        (FidmanSync.enqueueFidmanContractPush as any).mockResolvedValue(777);
        (FidmanSync.tryDeliverAfterCommit as any).mockRejectedValue(
            new Error('FIDman unreachable')
        );

        const ContractsController = (await import('../ContractsController'))
            .default;

        await expect(
            ContractsController.add(makeContract(4) as any)
        ).resolves.toBeDefined();

        expect(ToolsDb.transaction).toHaveBeenCalledTimes(1);
        expect(mockConn.rollback).not.toHaveBeenCalled();
        expect(FidmanSync.enqueueFidmanContractPush).toHaveBeenCalledTimes(1);
        expect(FidmanSync.tryDeliverAfterCommit).toHaveBeenCalledWith(777);
    });
});
