import type { PoolConnection } from 'mysql2/promise';
import type { ProjectScope, UserData } from '../../../types/sessionTypes';
import ToolsDb from '../../../tools/ToolsDb';
import Repository from './ConsolidationOperationRepository';
import Participants from './ConsolidationPreviewRepository';
import Notes from './ConsolidationNoteRepository';
import Operation from './ConsolidationOperation';

import Access from './ConsolidationAccessValidator';
import FinalizationRepository from './ConsolidationFinalizationRepository';
import Finalization from './ConsolidationFinalization';
import Human,{HumanTransport} from './ConsolidationFinalizationValidator';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';

const operations = new Repository(), participants = new Participants(), notes = new Notes();

export default class ConsolidationStatusController {
    private static async read<T>(id: unknown, user: UserData | undefined, scope: ProjectScope | undefined,
        action: (record: NonNullable<Awaited<ReturnType<Repository['find']>>>, conn: PoolConnection) => Promise<T>, sourceId?: number,machine?:HumanTransport) {
        Human.human(user,machine);
        const operationId = sourceId === undefined ? Access.uuid(id) : undefined;
        const conn = await ToolsDb.pool.getConnection().catch(() => { throw new Error('RETRYABLE_STORAGE_ERROR', 503); });
        let discarded = false;
        try {
            await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
            await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
            await new FinalizationRepository().account(user!,conn);
            const record = sourceId === undefined ? await operations.find(operationId!, conn, false) : await operations.forSource(sourceId, conn);
            if (!record && sourceId !== undefined) {
                const current = await participants.participants([sourceId], conn);
                Access.participants([sourceId], current, scope);
                await conn.commit();
                return null;
            }
            if (!record || (scope && !scope.projectOurIds.includes(record.projectOurId)))
                throw new Error('OBJECT_NOT_FOUND', 404);
            await new FinalizationRepository().authorize(record.operationId,user!,scope,conn);
            const result = await action(record, conn);
            await conn.commit();
            return result;
        } catch (error) {
            try { await conn.rollback(); } catch { discarded = true; conn.destroy(); }
            if (error instanceof Error) throw error;
            throw new Error('RETRYABLE_STORAGE_ERROR', 503);
        } finally { if (!discarded) conn.release(); }
    }

    private static async projection(record: NonNullable<Awaited<ReturnType<Repository['find']>>>, conn: PoolConnection) {

            const state = Operation.restore(record);
            const pointer=state.finalization;
            const row=pointer?await new FinalizationRepository().find(record.operationId,pointer.actorId,pointer.requestId,conn):undefined;
            const journal=row?Finalization.restore(row):undefined;
            const completed=state.state==='COMPLETED';
            const pending = state.units.filter(u => !u.moved).length;
            return { operationId: state.operationId, revision: record.revision, state: state.state,
                sourceMilestoneId: state.sourceMilestoneId, destinationMilestoneId: state.destinationMilestoneId,
                accountingContractId: state.accountingContractId, caseMappings: state.caseMappings,
                units: state.units.map(u => ({ ...u, state: u.moved ? 'MOVED' : 'PENDING' })),
                counts: { moved: state.units.length - pending, pending }, batches: state.batches,
                // Recorded DB progress is not a fresh dependency or Drive check.
                requiresRevalidation: true, documentsReady: completed, sourceDatabaseRemoved: completed, sourceFolderTrashed: completed||Boolean(journal?.folderTrashed),
                cleanup: { reason:journal?.events[journal.events.length-1]?.reason??'',sourceFolderId:journal?.sourceFolderId??null,step: journal?.step??'NOT_STARTED', sourceFolderStatus: completed||journal?.folderTrashed?'TRASHED':'UNKNOWN', remainingCount: completed?0:null, verificationComplete: completed },
                allowedActions: completed?[]:state.state==='TRANSFERRING'?['PREVIEW','CHECK',...(pending?[]:['FINALIZE'])]:['CHECK','RETRY'] };
    }
    static async get(id: unknown, user?: UserData, scope?: ProjectScope,machine?:HumanTransport) {
        const result = await this.read(id, user, scope, async (record,conn) => this.projection(record,conn),undefined,machine);
        if (result === null) throw new Error('OBJECT_NOT_FOUND', 404);
        return result;
    }

    static async forSource(id: unknown, user?: UserData, scope?: ProjectScope,machine?:HumanTransport) {
        // Same management role/current and historical participant gates as the status endpoint.
        Human.human(user,machine);
        const sourceId = Access.milestoneId(id);
        return { operation: await this.read(undefined, user, scope, async (record,conn) => this.projection(record,conn), sourceId,machine) };
    }

    static async getNotes(id: unknown, user?: UserData, scope?: ProjectScope,machine?:HumanTransport) {
        const result = await this.read(id, user, scope, async (record, conn) => ({ operationId: record.operationId,
            notes: await notes.findForOperation(record.operationId, conn) }),undefined,machine);
        if (result === null) throw new Error('OBJECT_NOT_FOUND', 404);
        return result;
    }
}
