import { AsyncLocalStorage } from 'async_hooks';
import type { PoolConnection } from 'mysql2/promise';
import ToolsDb from '../../../tools/ToolsDb';
import Repository from './MilestoneSharingRepository';
import SharingError from './MilestoneSharingError';

type Ownership = { active: boolean; transaction: boolean };
const ownership = new AsyncLocalStorage<Ownership>();
const repository = new Repository();
let queue: Promise<void> = Promise.resolve();

/** Owns the database-scoped lifecycle lock and, optionally, the entire DB-only transaction. */
export default class MilestoneLifecycleController {
    static async run<T>(action: () => Promise<T>): Promise<T> {
        const current = ownership.getStore();
        if (current?.active) {
            if (current.transaction) throw new SharingError('NESTED_LIFECYCLE_WRITE', 409);
            return action();
        }
        return this.own(false, action);
    }

    /** Keep the named-lock connection available to a workflow until all external effects finish. */
    static async runWithConnection<T>(action: (conn: PoolConnection) => Promise<T>): Promise<T> {
        if (ownership.getStore()?.active) throw new SharingError('NESTED_LIFECYCLE_WRITE', 409);
        return this.own(false, action);
    }

    static async transaction<T>(action: (conn: PoolConnection) => Promise<T>, serializable = false): Promise<T> {
        // A nested ordinary writer may own a different transaction; never silently join it.
        if (ownership.getStore()?.active) throw new SharingError('NESTED_LIFECYCLE_WRITE', 409);
        return this.own(true, action, serializable);
    }

    /** Commit a DB step while an outer workflow still owns the named-lock connection. */
    static async transactionWithinRun<T>(action: (conn: PoolConnection) => Promise<T>): Promise<T> {
        const current = ownership.getStore();
        if (!current?.active || current.transaction) throw new SharingError('NESTED_LIFECYCLE_WRITE', 409);
        return ToolsDb.transaction<T>(action);
    }

    private static async own<T>(transaction: boolean, action: (conn: PoolConnection) => Promise<T>, serializable = false): Promise<T> {
        const previous = queue;
        let done!: () => void;
        queue = new Promise<void>(resolve => { done = resolve; });
        await previous;
        let conn: PoolConnection;
        try { conn = await ToolsDb.pool.getConnection(); }
        catch (error) { done(); throw error; }
        let locked = false, inTransaction = false, discarded = false, committed = false;
        const context = { active: true, transaction };
        const discard = () => { if (!discarded) { discarded = true; conn.destroy(); } };
        try {
            try { locked = await repository.acquire(conn); }
            catch (error) { discard(); throw error; }
            if (!locked) throw new SharingError('RETRYABLE_STORAGE_ERROR', 503);
            return await ownership.run(context, async () => {
                if (transaction) {
                    if (serializable) await conn.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
                    inTransaction = true; await conn.beginTransaction();
                }
                const result = await action(conn);
                if (transaction) { await conn.commit(); inTransaction = false; committed = true; }
                return result;
            });
        } catch (error) {
            if (inTransaction) {
                try { await conn.rollback(); } catch { discard(); }
            }
            throw error;
        } finally {
            context.active = false;
            try {
                if (!discarded) {
                    try {
                        if (locked) await repository.release(conn);
                        conn.release();
                    } catch (error) {
                        discard();
                        // A confirmed commit already contains the receipt. Preserve its successful result.
                        if (!committed) throw error;
                    }
                }
            } finally { done(); }
        }
    }
}
