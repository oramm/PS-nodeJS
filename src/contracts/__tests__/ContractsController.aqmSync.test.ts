/**
 * WS10 / N3 — controller-level integration of the AQM outbox push.
 *
 * Coverage:
 *  - AQM-type contract → outbox row enqueued via the SAME tx conn
 *  - non-AQM type → no outbox row
 *  - L8 GUARANTEE: a push failure (post-commit) must NEVER throw out of, nor
 *    roll back, the contract transaction. We simulate the delivery throwing and
 *    assert add() still resolves and the contract tx committed normally.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../tools/ToolsDb');
jest.mock('../../tools/Tools');
jest.mock('../ContractEntityRepository');
jest.mock('../contractRangesContracts/ContractRangeContractRepository');
jest.mock('../../ScrumSheet/CurrentSprintValidator');
jest.mock('../../setup/Sessions/IntersessionsTasksStore');
// Mock the AqmSync module so we control gating, enqueue and (failing) delivery.
jest.mock('../aqmSync/AqmSync');

import ToolsDb from '../../tools/ToolsDb';
import Tools from '../../tools/Tools';
import CurrentSprintValidator from '../../ScrumSheet/CurrentSprintValidator';
import TaskStore from '../../setup/Sessions/IntersessionsTasksStore';
import * as AqmSync from '../aqmSync/AqmSync';

describe('ContractsController.add() — WS10 AQM outbox', () => {
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

        // isUniquePerProject() queries the DB → return [] (unique).
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
        alias: 'AQM-TEST',
        typeId,
        _type: { id: typeId, name: typeId === 10 ? 'AQM' : 'UR', isOur: true },
        number: '001',
        name: 'Umowa AQM',
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

    it('AQM type → enqueues outbox row using the tx conn, then delivers post-commit', async () => {
        (AqmSync.isAqmContractType as jest.Mock).mockReturnValue(true);
        (AqmSync.enqueueAqmPush as any).mockImplementation(
            async (_c: any, conn: any) => {
                enqueueCalledWithConn = conn;
                return 555;
            }
        );
        (AqmSync.tryDeliverAfterCommit as any).mockResolvedValue(undefined);

        const ContractsController = (await import('../ContractsController'))
            .default;
        await ContractsController.add(makeContract(10) as any);

        expect(AqmSync.enqueueAqmPush).toHaveBeenCalledTimes(1);
        // SAME connection as the contract transaction (L8)
        expect(enqueueCalledWithConn).toBe(mockConn);
        expect(AqmSync.tryDeliverAfterCommit).toHaveBeenCalledWith(555);
    });

    it('non-AQM type → no outbox row, no delivery', async () => {
        (AqmSync.isAqmContractType as jest.Mock).mockReturnValue(false);

        const ContractsController = (await import('../ContractsController'))
            .default;
        await ContractsController.add(makeContract(2) as any);

        expect(AqmSync.enqueueAqmPush).not.toHaveBeenCalled();
        expect(AqmSync.tryDeliverAfterCommit).not.toHaveBeenCalled();
    });

    it('L8: a post-commit push throw does NOT propagate out of add() nor roll back the contract', async () => {
        (AqmSync.isAqmContractType as jest.Mock).mockReturnValue(true);
        (AqmSync.enqueueAqmPush as any).mockResolvedValue(777);
        // Force the post-commit delivery to REJECT. If the contract path were not
        // insulated, add() would reject too. L8 requires add() to still resolve.
        (AqmSync.tryDeliverAfterCommit as any).mockRejectedValue(
            new Error('AQM unreachable')
        );

        const ContractsController = (await import('../ContractsController'))
            .default;

        await expect(
            ContractsController.add(makeContract(10) as any)
        ).resolves.toBeDefined();

        // Contract tx ran once and was committed (callback resolved) — the push
        // failure happened strictly AFTER, and never reached rollback.
        expect(ToolsDb.transaction).toHaveBeenCalledTimes(1);
        expect(mockConn.rollback).not.toHaveBeenCalled();
        // enqueue happened inside the tx; delivery was attempted post-commit.
        expect(AqmSync.enqueueAqmPush).toHaveBeenCalledTimes(1);
        expect(AqmSync.tryDeliverAfterCommit).toHaveBeenCalledWith(777);
    });
});
