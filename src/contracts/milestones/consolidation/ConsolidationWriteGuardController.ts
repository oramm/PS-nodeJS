import type { PoolConnection } from 'mysql2/promise';
import Lifecycle from '../sharing/MilestoneLifecycleController';
import ToolsDb from '../../../tools/ToolsDb';
import Repository, { LetterDestructionContext } from './ConsolidationWriteGuardRepository';
import Validator from './ConsolidationWriteGuardValidator';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';

const repository = new Repository();
export default class ConsolidationWriteGuardController {
    /** Keep the destination usable while preventing loss of its identity and mapped structure. */
    static async structure<T>(kind: 'milestone' | 'case' | 'contract' | 'project', id: unknown,
        dto: any | undefined, fields: string[] | undefined, action: () => Promise<T>): Promise<T> {
        const [objectId] = Validator.ids([id]);
        return Lifecycle.run(async () => {
            const conn = await ToolsDb.pool.getConnection().catch(() => { throw new Error('RETRYABLE_STORAGE_ERROR', 503); });
            try { Validator.structure(kind, await repository.structuralOperations(kind, objectId, conn), dto, fields); }
            catch (error) { if (error instanceof Error) throw error; throw new Error('RETRYABLE_STORAGE_ERROR', 503); }
            finally { conn.release(); }
            return action();
        });
    }
    static async sharing<T>(id: unknown, deleting: boolean, action: () => Promise<T>): Promise<T> {
        const ids = Validator.ids([id]);
        return Lifecycle.run(async () => {
            const conn = await ToolsDb.pool.getConnection().catch(() => { throw new Error('RETRYABLE_STORAGE_ERROR', 503); });
            try {
                Validator.writable(await repository.sourceOperations(ids, conn));
                if (deleting) Validator.writable(await repository.destinationOperations(ids, conn));
            } catch (error) { if (error instanceof Error) throw error; throw new Error('RETRYABLE_STORAGE_ERROR', 503); }
            finally { conn.release(); }
            return action();
        });
    }
    /** Ordinary contract edits must not change a consolidation source context. */
    static async contractEdit<T>(id: unknown, action: () => Promise<T>): Promise<T> {
        const [contractId] = Validator.ids([id]);
        return Lifecycle.run(async () => {
            const conn = await ToolsDb.pool.getConnection().catch(() => { throw new Error('RETRYABLE_STORAGE_ERROR', 503); });
            try {
                Validator.writable(await repository.contractSourceOperations(contractId, false, conn));
            } catch (error) {
                if (error instanceof Error) throw error;
                throw new Error('RETRYABLE_STORAGE_ERROR', 503);
            } finally { conn.release(); }
            return action();
        });
    }
    static async allTaskHours<T>(action: (conn: PoolConnection) => Promise<T>): Promise<T> {
        return Lifecycle.transaction(async conn => {
            try {
                Validator.writable(await repository.taskSourceOperations(conn));
            } catch (error) {
                if (error instanceof Error) throw error;
                throw new Error('RETRYABLE_STORAGE_ERROR', 503);
            }
            return action(conn);
        });
    }
    /** Protect the persisted task parent and retain the connection through commit/rollback. */
    static async taskHours<T>(taskId: unknown,
        action: (conn: PoolConnection) => Promise<T>): Promise<T> {
        const ids = Validator.ids([taskId]);
        return Lifecycle.transaction(async conn => {
            try {
                const tasks = await repository.taskCases(ids, conn);
                Validator.complete(ids, tasks);
                const caseIds = Validator.ids(tasks.map(task => Number(task.CaseId)));
                const parents = Validator.parents(caseIds, await repository.caseParents(caseIds, conn));
                Validator.writable(await repository.sourceOperations(parents, conn));
            } catch (error) {
                if (error instanceof Error) throw error;
                throw new Error('RETRYABLE_STORAGE_ERROR', 503);
            }
            return action(conn);
        });
    }
    /** Hold the lifecycle lock from persisted identity checks through all deletion effects. */
    static async letterDestruction<T>(letterId: unknown,
        action: (stored: LetterDestructionContext) => Promise<T>): Promise<T> {
        const [id] = Validator.ids([letterId]);
        return Lifecycle.runWithConnection(async conn => {
            let stored: LetterDestructionContext;
            try {
                const { letters, cases } = await repository.letterCases(id, conn);
                Validator.complete([id], letters);
                const caseIds = Validator.ids(cases.map(row => Number(row.CaseId)));
                const parents = Validator.parents(caseIds, await repository.caseParents(caseIds, conn));
                Validator.writable(await repository.sourceOperations(parents, conn));
                stored = letters[0];
            } catch (error) {
                if (error instanceof Error) throw error;
                throw new Error('RETRYABLE_STORAGE_ERROR', 503);
            }
            return action(stored);
        });
    }
    /** Protect newly requested letter-case edges through the DB commit. */
    static async letterCreate<T>(caseIds: readonly unknown[],
        action: (conn: PoolConnection) => Promise<T>, withinWorkflow = false): Promise<T> {
        const requested = Validator.ids(caseIds);
        const guardedAction = async (conn: PoolConnection) => {
            try {
                const parents = Validator.parents(requested, await repository.caseParents(requested, conn));
                Validator.writable(await repository.sourceOperations(parents, conn));
            } catch (error) {
                if (error instanceof Error) throw error;
                throw new Error('RETRYABLE_STORAGE_ERROR', 503);
            }
            return action(conn);
        };
        return withinWorkflow
            ? Lifecycle.transactionWithinRun(guardedAction)
            : Lifecycle.transaction(guardedAction);
    }
    /** Validate before incoming-letter Google I/O, then retain the named lock through cleanup. */
    static async letterCreationWorkflow<T>(caseIds: readonly unknown[], action: () => Promise<T>): Promise<T> {
        const requested = Validator.ids(caseIds);
        return Lifecycle.runWithConnection(async conn => {
            try {
                const parents = Validator.parents(requested, await repository.caseParents(requested, conn));
                Validator.writable(await repository.sourceOperations(parents, conn));
            } catch (error) {
                if (error instanceof Error) throw error;
                throw new Error('RETRYABLE_STORAGE_ERROR', 503);
            }
            return action();
        });
    }
    /** Protect both stored and requested letter-case edges through the DB commit. */
    static async letterEdit<T>(letterId: unknown, nextCaseIds: readonly unknown[],
        action: (conn: PoolConnection) => Promise<T>): Promise<T> {
        const [id] = Validator.ids([letterId]);
        const requested = Validator.ids(nextCaseIds);
        return Lifecycle.transaction(async conn => {
            try {
                const { letters, cases } = await repository.letterCases(id, conn);
                Validator.complete([id], letters);
                const caseIds = Validator.ids([...requested, ...cases.map(row => Number(row.CaseId))]);
                const parents = Validator.parents(caseIds, await repository.caseParents(caseIds, conn));
                Validator.writable(await repository.sourceOperations(parents, conn));
            } catch (error) {
                if (error instanceof Error) throw error;
                throw new Error('RETRYABLE_STORAGE_ERROR', 503);
            }
            return action(conn);
        });
    }
    static async securityDestruction<T>(id: unknown, action: (caseId: number) => Promise<T>): Promise<T> {
        const ids = Validator.ids([id]);
        return Lifecycle.run(async () => {
            const conn = await ToolsDb.pool.getConnection().catch(() => { throw new Error('RETRYABLE_STORAGE_ERROR', 503); });
            let caseId: number;
            try {
                const securities = await repository.securityCases(ids, conn);
                Validator.complete(ids, securities);
                [caseId] = Validator.ids(securities.map(row => Number(row.CaseId)));
                const parents = Validator.parents([caseId], await repository.caseParents([caseId], conn));
                Validator.writable(await repository.sourceOperations(parents, conn));
                Validator.writable(await repository.destinationOperations(parents, conn));
            } catch (error) {
                if (error instanceof Error) throw error;
                throw new Error('RETRYABLE_STORAGE_ERROR', 503);
            } finally { conn.release(); }
            return action(caseId);
        });
    }
    static async securityEdit<T>(id: unknown, caseId: unknown,
        action: (conn: PoolConnection) => Promise<T>): Promise<T> {
        const ids = Validator.ids([id]);
        const selectedCases = caseId === undefined ? [] : Validator.ids([caseId]);
        return Lifecycle.transaction(async conn => {
            try {
                const securities = await repository.securityCases(ids, conn);
                Validator.complete(ids, securities);
                const caseIds = Validator.ids([...selectedCases, ...securities.map(row => Number(row.CaseId))]);
                const parents = Validator.parents(caseIds, await repository.caseParents(caseIds, conn));
                Validator.writable(await repository.sourceOperations(parents, conn));
            } catch (error) {
                if (error instanceof Error) throw error;
                throw new Error('RETRYABLE_STORAGE_ERROR', 503);
            }
            return action(conn);
        });
    }
    /** DB-only process writes own the same connection and lock through commit/rollback. */
    static async processes<T>(processIds: readonly unknown[], caseIds: readonly unknown[], taskIds: readonly unknown[],
        action: (conn: PoolConnection) => Promise<T>): Promise<T> {
        const pids = Validator.ids(processIds), cids = Validator.ids(caseIds), tids = Validator.ids(taskIds);
        return Lifecycle.transaction(async conn => {
            try {
                const processes = await repository.processParents(pids, conn);
                Validator.complete(pids, processes);
                const allTasks = Validator.ids([...tids, ...processes.flatMap(p => p.TaskId == null ? [] : [Number(p.TaskId)])]);
                const tasks = await repository.taskCases(allTasks, conn);
                Validator.complete(allTasks, tasks);
                const allCases = Validator.ids([...cids, ...processes.map(p => Number(p.CaseId)), ...tasks.map(t => Number(t.CaseId))]);
                const parents = Validator.parents(allCases, await repository.caseParents(allCases, conn));
                Validator.writable(await repository.sourceOperations(parents, conn));
            } catch (error) {
                if (error instanceof Error) throw error;
                throw new Error('RETRYABLE_STORAGE_ERROR', 503);
            }
            return action(conn);
        });
    }
    static async meetingDestruction<T>(id: unknown, action: () => Promise<T>): Promise<T> {
        const [meetingId] = Validator.ids([id]);
        return Lifecycle.run(async () => {
            const conn = await ToolsDb.pool.getConnection().catch(() => { throw new Error('RETRYABLE_STORAGE_ERROR', 503); });
            try {
                const caseIds = Validator.ids((await repository.meetingCases(meetingId, conn)).map(row => row.CaseId));
                const parents = Validator.parents(caseIds, await repository.caseParents(caseIds, conn));
                Validator.writable(await repository.sourceOperations(parents, conn));
            } catch (error) {
                if (error instanceof Error) throw error;
                throw new Error('RETRYABLE_STORAGE_ERROR', 503);
            } finally { conn.release(); }
            return action();
        });
    }
    static async contractDestruction<T>(id: unknown, moving: boolean, action: () => Promise<T>): Promise<T> {
        const [contractId] = Validator.ids([id]);
        return Lifecycle.run(async () => {
            const conn = await ToolsDb.pool.getConnection().catch(() => { throw new Error('RETRYABLE_STORAGE_ERROR',503); });
            try {
                Validator.writable(await repository.contractSourceOperations(contractId, moving, conn));
                Validator.writable(await repository.contractDestinationOperations(contractId, moving, conn));
                const caseIds = Validator.ids((await repository.contractMeetingCases(contractId, moving, conn)).map(row => row.CaseId));
                const parents = Validator.parents(caseIds, await repository.caseParents(caseIds, conn));
                Validator.writable(await repository.sourceOperations(parents, conn));
            } catch (error) {
                if (error instanceof Error) throw error;
                throw new Error('RETRYABLE_STORAGE_ERROR',503);
            } finally { conn.release(); }
            return action();
        });
    }
    /** The lifecycle lock stays held through action, including its DB commit and subsequent external I/O. */
    static async cases<T>(milestoneIds: readonly unknown[], caseIds: readonly unknown[], action: () => Promise<T>): Promise<T> {
        const mids = Validator.ids(milestoneIds), cids = Validator.ids(caseIds);
        return Lifecycle.run(async () => {
            const conn = await ToolsDb.pool.getConnection().catch(() => { throw new Error('RETRYABLE_STORAGE_ERROR',503); });
            try {
                const parents = Validator.parents(cids, await repository.caseParents(cids,conn));
                Validator.writable(await repository.sourceOperations(Validator.ids([...mids,...parents]),conn));
            } catch (error) {
                if (error instanceof Error) throw error;
                throw new Error('RETRYABLE_STORAGE_ERROR',503);
            } finally { conn.release(); }
            return action();
        });
    }
}
