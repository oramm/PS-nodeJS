import type { PoolConnection } from 'mysql2/promise';
import type { ProjectScope, UserData } from '../../../types/sessionTypes';
import AccessController from './ConsolidationAccessController';
import Lifecycle from '../sharing/MilestoneLifecycleController';
import Repository from '../sharing/MilestoneSharingRepository';
import Access from './ConsolidationAccessValidator';
import Validator from './ConsolidationBatchValidator';
import { canonical } from './ConsolidationPreview';
import { ConsolidationMappingError } from './ConsolidationMappingValidator';

const repository = new Repository();
const endpoint = 'POST:/milestone-consolidations/apply';
type Work<T> = {
    serializable?: boolean;
    /** A concrete endpoint may authorize a retained receipt without requiring deleted live source rows. */
    authorizeReceipt?: (conn:PoolConnection)=>Promise<void>;
    authorizeReplay?: (result:unknown,conn:PoolConnection)=>Promise<void>;
    /** Must check current participants/scope, including on replay; must not check stale revision here. */
    authorize: (conn: PoolConnection) => Promise<void>;
    /** DB-only work: lock/re-read, validate fresh revision and execute all effects using this connection. */
    execute: (conn: PoolConnection) => Promise<T>;
};

/** Internal transaction boundary, not an apply endpoint or authorization implementation. */
export default class ConsolidationReceiptController {
    static async run<T>(input: unknown, user: UserData | undefined, work: Work<T>, scope?: ProjectScope): Promise<T> {
        Access.actor(user);
        const actorId = user!.enviId;
        const { requestId, ...payload } = Validator.request(input);
        const serialized = canonical(payload);
        try {
            return await Lifecycle.transaction(async conn => {
                if(work.authorizeReplay){if(!work.authorizeReceipt)throw new ConsolidationMappingError('INVALID_REQUEST',400);await work.authorizeReceipt(conn);}
                else {await AccessController.getSaved(payload.previewId,user,scope,conn);await work.authorize(conn);}
                const receipt = await repository.receipt(actorId, endpoint, requestId, conn);
                let result: T;
                if (receipt) {
                    if (receipt.Payload !== serialized) throw new ConsolidationMappingError('IDEMPOTENCY_CONFLICT', 409);
                    // Replay precedes execute/revision validation: the prior commit changed the live revision.
                    result = JSON.parse(receipt.Result);
                    if(work.authorizeReplay)await work.authorizeReplay(result,conn);
                } else {
                    if(work.authorizeReplay){await AccessController.getSaved(payload.previewId,user,scope,conn);await work.authorize(conn);}
                    const value = await work.execute(conn);
                    // Refuse lossy snapshots (Date/undefined/NaN etc.) before commit and return exactly what is stored.
                    result = JSON.parse(canonical(value));
                    await repository.saveReceipt(actorId, endpoint, requestId, serialized, result, conn);
                }
                return result;
            }, work.serializable);
        } catch (error) {
            if (error instanceof ConsolidationMappingError) throw error;
            throw new ConsolidationMappingError('RETRYABLE_STORAGE_ERROR', 503);
        }
    }
}
