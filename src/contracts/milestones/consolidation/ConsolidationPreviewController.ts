import OperationRepository from './ConsolidationOperationRepository';
import Operation, { OperationState } from './ConsolidationOperation';
import Progress from './ConsolidationProgress';
import ToolsDb from '../../../tools/ToolsDb';
import type { PoolConnection } from 'mysql2/promise';
import type { UserData, ProjectScope } from '../../../types/sessionTypes';
import Repository from './ConsolidationPreviewRepository';
import Reader from './ConsolidationEffectsRepository';
import Preview from './ConsolidationPreview';
import MappingValidator, { ConsolidationMappingError } from './ConsolidationMappingValidator';
import Access from './ConsolidationAccessValidator';
import AccessController from './ConsolidationAccessController';

const repository = new Repository(), reader = new Reader();
export default class ConsolidationPreviewController {
    private static async transaction<T>(write: boolean, action: (conn: PoolConnection) => Promise<T>) {
        const conn = await ToolsDb.pool.getConnection().catch(() => { throw new ConsolidationMappingError('RETRYABLE_STORAGE_ERROR', 503); });
        let discarded = false;
        try {
            await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
            await conn.query(write ? 'START TRANSACTION WITH CONSISTENT SNAPSHOT' : 'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
            const result = await action(conn);
            await conn.commit();
            return result;
        } catch (error) {
            try { await conn.rollback(); } catch { discarded = true; conn.destroy(); }
            if (error instanceof ConsolidationMappingError) throw error;
            // Do not leak SQL, snapshot content or credentials through global error reporting.
            throw new ConsolidationMappingError('RETRYABLE_STORAGE_ERROR', 503);
        } finally { if (!discarded) conn.release(); }
    }
    private static async read(request: ReturnType<typeof MappingValidator.request>, actorId: number, conn: PoolConnection, scope?: ProjectScope) {
        const ids = [request.sourceMilestoneId, request.destinationMilestoneId];
        let operation: OperationState | undefined;
        if (request.operationId) {
            const record = await new OperationRepository().find(request.operationId, conn, false);
            if (!record || (scope && !scope.projectOurIds.includes(record.projectOurId)))
                throw new ConsolidationMappingError('OBJECT_NOT_FOUND', 404);
            const state = Operation.restore(record);
            operation = state;
            if (state.sourceMilestoneId !== ids[0] || state.destinationMilestoneId !== ids[1])
                throw new ConsolidationMappingError('INVALID_MAPPING');
            const current = await repository.participants(ids, conn);
            const project = Access.participants(ids, { ...current, contractIds: state.participantContractIds,
                contracts: await repository.contracts(state.participantContractIds, conn) }, scope);
            if (project !== state.projectOurId) throw new ConsolidationMappingError('CROSS_PROJECT', 409);
            for (const old of state.caseMappings) {
                const selected = request.mappings.find(m => m.sourceCaseId === old.sourceCaseId);
                if (selected && (selected.target.mode !== 'existing' || selected.target.caseId !== old.destinationCaseId))
                    throw new ConsolidationMappingError('INVALID_MAPPING');
                if (!selected) request.mappings.push({ sourceCaseId: old.sourceCaseId,
                    target: { mode: 'existing', caseId: old.destinationCaseId } });
            }
        }
        const data = await repository.participants(ids, conn);
        const projectOurId = Access.participants(ids, data, scope);
        const names = request.mappings.flatMap(m => m.target.mode === 'create' ? [m.target.name] : []);
        const snapshot = await reader.readEffects(projectOurId, ids, names, conn);
        return { snapshot, operation, context: { actorId, projectOurId, participantContractIds: data.contractIds } };
    }
    static async addFromDto(body: unknown, user?: UserData, scope?: ProjectScope) {
        Access.actor(user);
        const request = MappingValidator.request(body);
        return this.transaction(true, async conn => {
            const { snapshot, context, operation } = await this.read(request, user!.enviId, conn, scope);
            const preview = Preview.create(request, snapshot, context);
            const response = this.response(preview, operation);
            await repository.add(preview, conn);
            return response;
        });
    }
    static async get(id: unknown, user?: UserData, scope?: ProjectScope, expected?: unknown) {
        Access.actor(user);
        const previewId = Access.uuid(id);
        const revision = expected === undefined ? undefined : Access.revision(expected);
        return this.transaction(false, async conn => {
            const { header, text, saved } = await AccessController.getSaved(previewId, user, scope, conn);
            const { snapshot, context, operation } = await this.read(saved.content.request, header.ActorId, conn, scope);
            const current = Preview.revalidate(text, revision ?? saved.revision, saved.content.request, snapshot, context);
            return this.response(current, operation);
        });
    }
    private static response(preview: ReturnType<typeof Preview.create>, operation?: OperationState) {
        const { request, analysis } = preview.content;
        const progress = Progress.preview(preview, operation);
        const snapshot = preview.content.snapshot;
        const cards = (milestoneId: number) => snapshot.rows.Cases.filter(r => Number(r.MilestoneId) === milestoneId).map(r => {
            const type = snapshot.rows.CaseTypes.find(t => Number(t.Id) === Number(r.TypeId));
            const related = ['Letters_Cases','ProcessInstances','Risks','Securities','MeetingArrangements'];
            return { id: Number(r.Id), milestoneId, typeId: Number(r.TypeId), typeName: String(type?.Name || ''),
                isUniquePerMilestone: !!Number(type?.IsUniquePerMilestone), parentCaseId: r.ParentCaseId == null ? null : Number(r.ParentCaseId),
                name: r.Name == null ? '' : String(r.Name), folderId: typeof r.GdFolderId === 'string' ? r.GdFolderId : null,
                taskCount: snapshot.rows.Tasks.filter(t => Number(t.CaseId) === Number(r.Id)).length,
                relationCount: related.reduce((sum,table) => sum + snapshot.rows[table].filter(x => Number(x.CaseId) === Number(r.Id)).length,0) };
        });
        return { previewId: preview.previewId, revision: preview.revision, ...request, ...analysis,
            cases: { source: cards(request.sourceMilestoneId), destination: cards(request.destinationMilestoneId) },
            ...progress, totals: { ...analysis.totals,
                tasks: progress.units.reduce((sum, u) => sum + u.counts.tasks, 0),
                relations: progress.units.reduce((sum, u) => sum + u.counts.relations, 0),
                notes: progress.units.reduce((sum, u) => sum + u.counts.notes, 0),
                analyzedUnits: progress.units.filter(u => u.state === 'ANALYZED').length,
                blockedUnits: progress.units.filter(u => u.state === 'BLOCKED').length } };
    }
}
