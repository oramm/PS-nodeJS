import { randomUUID } from 'crypto';
import type { ProjectScope, UserData } from '../../../types/sessionTypes';
import Receipt from './ConsolidationReceiptController';
import FinalizationRepository from './ConsolidationFinalizationRepository';
import BatchReplay from './ConsolidationBatchReplayController';
import Human,{HumanTransport} from './ConsolidationFinalizationValidator';
import AccessController from './ConsolidationAccessController';
import Access from './ConsolidationAccessValidator';
import PreviewRepository from './ConsolidationPreviewRepository';
import OperationRepository from './ConsolidationOperationRepository';
import Reader from './ConsolidationEffectsRepository';
import TransferRepository from './ConsolidationTransferRepository';
import LinkRepository from '../sharing/MilestoneContractLinkRepository';
import Link from '../sharing/MilestoneContractLink';
import NoteRepository from './ConsolidationNoteRepository';
import AuditRepository from './ConsolidationAuditRepository';
import Preview from './ConsolidationPreview';
import Batch from './ConsolidationBatch';
import Operation, { OperationRecord } from './ConsolidationOperation';
import Note from './ConsolidationNote';
import Audit from './ConsolidationAudit';
import Validator from './ConsolidationTransferValidator';
import BatchValidator from './ConsolidationBatchValidator';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';

const previews = new PreviewRepository(), operations = new OperationRepository(), reader = new Reader();
const transfer = new TransferRepository(), links = new LinkRepository(), notes = new NoteRepository(), audits = new AuditRepository();

export default class ConsolidationApplyController {
    static async addFromDto(input: unknown, user?: UserData, scope?: ProjectScope,machine?:HumanTransport) {
        Human.human(user,machine);
        const request = BatchValidator.request(input);
        let saved: Awaited<ReturnType<typeof AccessController.getSaved>>;
        let operation: OperationRecord | undefined;
        let involved: string[];
        return Receipt.run(input, user, {
            serializable: true,
            authorizeReceipt:conn=>new FinalizationRepository().account(user!,conn).then(()=>undefined),
            authorizeReplay:(result,conn)=>BatchReplay.authorize(result,request.requestId,request.previewId,user!,scope,conn),
            authorize: async conn => {
                saved = await AccessController.getSaved(request.previewId, user, scope, conn);
                const mapping = saved.saved.content.request;
                const ids = [mapping.sourceMilestoneId, mapping.destinationMilestoneId];
                involved = await operations.involving(ids, conn);
                const id = mapping.operationId || (involved.length === 1 ? involved[0] : undefined);
                operation = id ? await operations.find(id, conn) : undefined;
                if (mapping.operationId && !operation) throw new Error('OBJECT_NOT_FOUND', 404);
                if (operation) {
                    const state = Operation.restore(operation);
                    const current = await previews.participants(ids, conn);
                    const project = Access.participants(ids, { ...current, contractIds: state.participantContractIds,
                        contracts: await previews.contracts(state.participantContractIds, conn) }, scope);
                    if (project !== state.projectOurId || state.sourceMilestoneId !== ids[0] || state.destinationMilestoneId !== ids[1])
                        throw new Error('OPERATION_IN_PROGRESS', 409);
                }
            },
            execute: async conn => {
                const { content } = saved.saved;
                const mapping = content.request;
                if (involved.length && (!mapping.operationId || involved.some(id => id !== mapping.operationId)))
                    throw new Error('OPERATION_IN_PROGRESS', 409);
                const ids = [mapping.sourceMilestoneId, mapping.destinationMilestoneId];
                const participants = await previews.participants(ids, conn);
                await transfer.lock('Contracts', participants.contractIds, conn);
                await transfer.lock('Milestones', ids, conn);
                await transfer.lock('Cases', content.snapshot.rows.Cases.map(row => Number(row.Id)), conn);
                const projectOurId = Access.participants(ids, participants, scope);
                const names = mapping.mappings.flatMap(m => m.target.mode === 'create' ? [m.target.name] : []);
                const before = await reader.readEffects(projectOurId, ids, names, conn);
                Preview.revalidate(saved.text, request.expectedRevision, mapping, before,
                    { actorId: content.scope.actorId, projectOurId, participantContractIds: participants.contractIds });
                const plan = Batch.prepare(saved.text, request);
                if (before.rows.Milestones.some(row => Number(row.TypeId) !== 5)) throw new Error('TYPE_UNAVAILABLE', 409);
                Validator.storage(await transfer.storage(conn, Object.keys(before.rows)));
                const timestamp = await transfer.timestamp(conn);
                const next = operation
                    ? Operation.advance(operation, operation.revision, saved.text, request, user!.enviId)
                    : Operation.first(saved.text, request, randomUUID(), user!.enviId);
                const sourceContract = Number(before.rows.Milestones.find(row => Number(row.Id) === plan.sourceMilestoneId)!.ContractId);
                if (operation) {
                    if (!await operations.edit(next, operation.revision, conn)) throw new Error('STALE_REVISION', 409);
                } else await operations.add(next, conn);
                for (const move of plan.taskMoves)
                    Validator.affected(await transfer.move('Tasks', move.taskId, move.sourceCaseId, move.destinationCaseId, conn, timestamp));
                for (const move of plan.referenceMoves)
                    Validator.affected(await transfer.move(move.table, move.id, move.sourceCaseId, move.destinationCaseId, conn, timestamp));
                for (const edge of plan.letterEdges) Validator.affected(await transfer.edge(edge, conn, timestamp));
                await notes.add(Note.create(saved.text, request, next.operationId, user!.enviId), conn);
                if (sourceContract !== plan.accountingContractId)
                    await links.addInDb(new Link({ milestoneId: plan.destinationMilestoneId, contractId: sourceContract }), conn, true);
                const after = await reader.readEffects(projectOurId, ids, names, conn);
                Validator.reconcile(plan, after, sourceContract, timestamp);
                await audits.add(Audit.create(saved.text, request, next.operationId, user!.enviId, after), conn);
                const state = Operation.restore(next);
                return { operationId: next.operationId, revision: next.revision, state: state.state,
                    sourceMilestoneId: state.sourceMilestoneId, destinationMilestoneId: state.destinationMilestoneId,
                    accountingContractId: state.accountingContractId, units: state.units,
                    counts: { moved: state.units.filter(u => u.moved).length, pending: state.units.filter(u => !u.moved).length },
                    documentsReady: false };
            },
        }, scope);
    }
}
