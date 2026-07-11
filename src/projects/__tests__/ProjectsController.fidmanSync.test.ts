/**
 * SYNC-P1 (post-review) — standalone Project-update → FIDman outbox path.
 *
 * Net-new fragment with NO AqmSync equivalent, so it gets its own red-without-fix
 * coverage. DB-free (mocked ToolsDb), same style as ContractsController.fidmanSync.test.ts.
 * The ToolsDb.transaction mock emulates begin/commit/rollback so the atomicity
 * (rollback-on-failure) assertion is real, not cosmetic.
 *
 * Guarantees under test (each red-without-fix):
 *  1. same-conn enqueue: enqueueFidmanProjectPush + editInDb + association delete
 *     all use the tx conn.
 *  2. guard filter: project NOT the parent of a synced contract → NO enqueue.
 *  3. post-commit isolation: a rejected tryDeliverAfterCommit does not throw out
 *     of editProject and does not roll back the committed edit.
 *  4. rollback-on-failure: a throw INSIDE the tx (guard/enqueue) rolls back the
 *     project write (no half-write) and never attempts delivery.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../tools/ToolsDb');
jest.mock('../ProjectEntitiesController');
jest.mock('../../contracts/fidmanSync/FidmanSync');

import ToolsDb from '../../tools/ToolsDb';
import ProjectEntitiesController from '../ProjectEntitiesController';
import * as FidmanSync from '../../contracts/fidmanSync/FidmanSync';
import ProjectsController from '../ProjectsController';

describe('ProjectsController.editProject() — SYNC-P1 FIDman standalone sync', () => {
    let mockConn: any;
    let enqueueCalledWithConn: any;
    const fakeAuth = {} as any; // truthy → withAuth uses it, no OAuth refresh

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
        (ToolsDb.editInDb as any).mockResolvedValue(undefined);
        (ProjectEntitiesController.deleteByProjectId as any).mockResolvedValue(
            undefined
        );
    });

    // No _employers/_engineers → association insert loop is skipped.
    const makeProject = () =>
        ({
            id: 5,
            ourId: 'PRJ-001',
            name: 'Projekt',
            comment: 'opis',
            editProjectFolder: jest.fn(() => Promise.resolve(undefined)),
        }) as any;

    it('parent of a synced contract → enqueues via the SAME tx conn, delivers post-commit', async () => {
        (FidmanSync.projectHasSyncedContract as any).mockResolvedValue(true);
        (FidmanSync.enqueueFidmanProjectPush as any).mockImplementation(
            async (_p: any, conn: any) => {
                enqueueCalledWithConn = conn;
                return 555;
            }
        );
        (FidmanSync.tryDeliverAfterCommit as any).mockResolvedValue(undefined);

        await ProjectsController.edit(makeProject(), fakeAuth);

        expect(FidmanSync.projectHasSyncedContract).toHaveBeenCalledWith(
            'PRJ-001',
            mockConn
        );
        expect(FidmanSync.enqueueFidmanProjectPush).toHaveBeenCalledTimes(1);
        expect(enqueueCalledWithConn).toBe(mockConn);
        // project write + association delete are inside the same tx.
        const editCall = (ToolsDb.editInDb as jest.Mock).mock.calls[0] as any[];
        expect(editCall[2]).toBe(mockConn);
        expect(editCall[3]).toBe(true);
        expect(
            ProjectEntitiesController.deleteByProjectId
        ).toHaveBeenCalledWith(5, mockConn);
        expect(mockConn.commit).toHaveBeenCalledTimes(1);
        expect(mockConn.rollback).not.toHaveBeenCalled();
        expect(FidmanSync.tryDeliverAfterCommit).toHaveBeenCalledWith(555);
    });

    it('NOT the parent of any synced contract → guard false → NO enqueue, NO delivery', async () => {
        (FidmanSync.projectHasSyncedContract as any).mockResolvedValue(false);

        await ProjectsController.edit(makeProject(), fakeAuth);

        expect(FidmanSync.enqueueFidmanProjectPush).not.toHaveBeenCalled();
        expect(FidmanSync.tryDeliverAfterCommit).not.toHaveBeenCalled();
        expect(mockConn.commit).toHaveBeenCalledTimes(1);
        expect(mockConn.rollback).not.toHaveBeenCalled();
    });

    it('post-commit delivery rejection does NOT throw out of editProject nor roll back', async () => {
        (FidmanSync.projectHasSyncedContract as any).mockResolvedValue(true);
        (FidmanSync.enqueueFidmanProjectPush as any).mockResolvedValue(777);
        (FidmanSync.tryDeliverAfterCommit as any).mockRejectedValue(
            new Error('FIDman unreachable')
        );

        await expect(
            ProjectsController.edit(makeProject(), fakeAuth)
        ).resolves.toBeDefined();

        expect(mockConn.commit).toHaveBeenCalledTimes(1);
        expect(mockConn.rollback).not.toHaveBeenCalled();
        expect(FidmanSync.tryDeliverAfterCommit).toHaveBeenCalledWith(777);
    });

    it('guard throw INSIDE the tx → project write is rolled back, no delivery', async () => {
        (FidmanSync.projectHasSyncedContract as any).mockRejectedValue(
            new Error('guard query failed')
        );

        await expect(
            ProjectsController.edit(makeProject(), fakeAuth)
        ).rejects.toThrow('guard query failed');

        expect(mockConn.rollback).toHaveBeenCalledTimes(1);
        expect(mockConn.commit).not.toHaveBeenCalled();
        expect(FidmanSync.enqueueFidmanProjectPush).not.toHaveBeenCalled();
        expect(FidmanSync.tryDeliverAfterCommit).not.toHaveBeenCalled();
    });
});
