/**
 * SYNC-P1 (post-review) — standalone Entity-update → FIDman outbox path.
 *
 * Net-new fragment with NO AqmSync equivalent, so it gets its own red-without-fix
 * coverage. DB-free (mocked ToolsDb), same style as ContractsController.fidmanSync.test.ts.
 * The ToolsDb.transaction mock emulates begin/commit/rollback so the atomicity
 * (rollback-on-failure) assertion is real, not cosmetic.
 *
 * Guarantees under test (each red-without-fix):
 *  1. same-conn enqueue: enqueueFidmanEntityPush + editInDb use the tx conn.
 *  2. guard filter: entity NOT tied to a synced contract → NO enqueue.
 *  3. post-commit isolation: a rejected tryDeliverAfterCommit does not throw out
 *     of editEntity and does not roll back the committed edit.
 *  4. rollback-on-failure: a throw INSIDE the tx (guard/enqueue) rolls back the
 *     entity write (no half-write) and never attempts delivery.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../tools/ToolsDb');
jest.mock('../../contracts/fidmanSync/FidmanSync');

import ToolsDb from '../../tools/ToolsDb';
import * as FidmanSync from '../../contracts/fidmanSync/FidmanSync';
import EntitiesController from '../EntitiesController';

describe('EntitiesController.editEntity() — SYNC-P1 FIDman standalone sync', () => {
    let mockConn: any;
    let enqueueCalledWithConn: any;

    beforeEach(() => {
        jest.clearAllMocks();
        enqueueCalledWithConn = undefined;

        mockConn = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
        };

        // Emulate real begin/commit/rollback so atomicity is actually observable.
        (ToolsDb.transaction as jest.Mock).mockImplementation(
            async (cb: any) => {
                await mockConn.beginTransaction();
                try {
                    const result = await cb(mockConn);
                    await mockConn.commit();
                    return result;
                } catch (e) {
                    await mockConn.rollback();
                    throw e;
                }
            }
        );
        // editInDb bottoms out at ToolsDb.editInDb(tableName, entity, conn, ...)
        (ToolsDb.editInDb as any).mockResolvedValue(undefined);
    });

    // No shortName → skips the uniqueness pre-check (repository.find).
    const entityData = () => ({ id: 7, name: 'PWiK', taxNumber: '7471917575' });

    it('party of a synced contract → enqueues via the SAME tx conn, delivers post-commit', async () => {
        (FidmanSync.entityHasSyncedContract as any).mockResolvedValue(true);
        (FidmanSync.enqueueFidmanEntityPush as any).mockImplementation(
            async (_e: any, conn: any) => {
                enqueueCalledWithConn = conn;
                return 555;
            }
        );
        (FidmanSync.tryDeliverAfterCommit as any).mockResolvedValue(undefined);

        await EntitiesController.edit(entityData());

        // Guard consulted with the entity id + the tx conn.
        expect(FidmanSync.entityHasSyncedContract).toHaveBeenCalledWith(
            7,
            mockConn
        );
        // enqueue uses the SAME conn as the transaction (in-tx / L8).
        expect(FidmanSync.enqueueFidmanEntityPush).toHaveBeenCalledTimes(1);
        expect(enqueueCalledWithConn).toBe(mockConn);
        // the entity write itself is inside the same tx (conn is 3rd arg to editInDb).
        const editCall = (ToolsDb.editInDb as jest.Mock).mock.calls[0] as any[];
        expect(editCall[2]).toBe(mockConn);
        expect(editCall[3]).toBe(true);
        // committed, delivered post-commit, never rolled back.
        expect(mockConn.commit).toHaveBeenCalledTimes(1);
        expect(mockConn.rollback).not.toHaveBeenCalled();
        expect(FidmanSync.tryDeliverAfterCommit).toHaveBeenCalledWith(555);
    });

    it('NOT tied to any synced contract → guard false → NO enqueue, NO delivery', async () => {
        (FidmanSync.entityHasSyncedContract as any).mockResolvedValue(false);

        await EntitiesController.edit(entityData());

        expect(FidmanSync.enqueueFidmanEntityPush).not.toHaveBeenCalled();
        expect(FidmanSync.tryDeliverAfterCommit).not.toHaveBeenCalled();
        // the edit still commits (business write is independent of the sync).
        expect(mockConn.commit).toHaveBeenCalledTimes(1);
        expect(mockConn.rollback).not.toHaveBeenCalled();
    });

    it('post-commit delivery rejection does NOT throw out of editEntity nor roll back', async () => {
        (FidmanSync.entityHasSyncedContract as any).mockResolvedValue(true);
        (FidmanSync.enqueueFidmanEntityPush as any).mockResolvedValue(777);
        (FidmanSync.tryDeliverAfterCommit as any).mockRejectedValue(
            new Error('FIDman unreachable')
        );

        await expect(EntitiesController.edit(entityData())).resolves.toBeDefined();

        expect(mockConn.commit).toHaveBeenCalledTimes(1);
        expect(mockConn.rollback).not.toHaveBeenCalled();
        expect(FidmanSync.tryDeliverAfterCommit).toHaveBeenCalledWith(777);
    });

    it('guard throw INSIDE the tx → entity write is rolled back, no delivery', async () => {
        (FidmanSync.entityHasSyncedContract as any).mockRejectedValue(
            new Error('guard query failed')
        );

        await expect(EntitiesController.edit(entityData())).rejects.toThrow(
            'guard query failed'
        );

        expect(mockConn.rollback).toHaveBeenCalledTimes(1);
        expect(mockConn.commit).not.toHaveBeenCalled();
        expect(FidmanSync.enqueueFidmanEntityPush).not.toHaveBeenCalled();
        expect(FidmanSync.tryDeliverAfterCommit).not.toHaveBeenCalled();
    });
});
