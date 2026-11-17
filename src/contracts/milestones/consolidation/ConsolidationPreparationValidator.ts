import Preview, { canonical } from './ConsolidationPreview';
import Preparation, { PreparationState, PreparationFolder } from './ConsolidationPreparation';
import Access from './ConsolidationAccessValidator';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';
import type { EffectsSnapshot } from './ConsolidationEffectsRepository';
import type { ContentRow } from './ConsolidationReadRepository';

export default class ConsolidationPreparationValidator {
    static request(input: any) {
        if (!input || Array.isArray(input) || Object.keys(input).sort().join(',') !== 'expectedRevision,previewId,requestId')
            throw new Error('INVALID_REQUEST');
        return { requestId: Access.uuid(input.requestId), previewId: Access.uuid(input.previewId),
            expectedRevision: Access.revision({ expectedRevision: input.expectedRevision }) };
    }
    static initial(text: string) {
        const { content } = Preview.restore(text), { request, snapshot, analysis } = content;
        const ids = request.mappings.filter(m => m.target.mode === 'create').map(m => m.sourceCaseId);
        if (!ids.length) throw new Error('INVALID_MAPPING');
        if (snapshot.rows.Milestones.some(m => Number(m.TypeId) !== 5)) throw new Error('TYPE_UNAVAILABLE', 409);
        const conflict = analysis.conflicts.find(c => (c.sourceCaseId === null || ids.includes(c.sourceCaseId)) &&
            !(c.code === 'FOLDER_NOT_READY' && c.sourceCaseId !== null && ids.includes(c.sourceCaseId)));
        if (conflict) throw new Error(conflict.code, 409);
        for (const id of ids) {
            const m = request.mappings.find(m => m.sourceCaseId === id)!;
            if (m.target.mode !== 'create') continue;
            const target = m.target;
            const type = snapshot.rows.CaseTypes.find(t => Number(t.Id) === target.caseTypeId)!;
            if (typeof type.Name !== 'string' || type.FolderNumber == null) throw new Error('TYPE_UNAVAILABLE', 409);
            if (m.target.parentSourceCaseId !== null) {
                const parent = request.mappings.find(p => p.sourceCaseId === target.parentSourceCaseId);
                if (!parent || analysis.mappings.find(p => p.sourceCaseId === parent.sourceCaseId)?.state !== 'SELECTED')
                    throw new Error('INVALID_PARENT_MAPPING', 422);
                const parentTarget = parent.target;
                if (parentTarget.mode === 'existing' && !snapshot.rows.Cases.find(c => Number(c.Id) === parentTarget.caseId)?.GdFolderId)
                    throw new Error('FOLDER_NOT_READY', 409);
            } else {
                const cached = snapshot.rows.CaseTypeFolders.find(f => Number(f.MilestoneId) === request.destinationMilestoneId && Number(f.CaseTypeId) === Number(type.Id));
                if (cached && Number(type.IsUniquePerMilestone)) throw new Error('FOLDER_ALIAS', 409);
                if (!cached && !Number(type.IsUniquePerMilestone) && snapshot.rows.Cases.some(c =>
                    Number(c.MilestoneId) === request.destinationMilestoneId && Number(c.TypeId) === Number(type.Id) && c.ParentCaseId == null))
                    throw new Error('RECONCILIATION_REQUIRED', 409);
            }
        }
    }
    static current(state: PreparationState, snapshot: EffectsSnapshot, participantContractIds: number[]) {
        const saved = Preview.restore(state.previewText);
        for (const c of state.cases.filter(c => c.row)) {
            const current = snapshot.rows.Cases.find(r => Number(r.Id) === Number(c.row!.Id));
            if (!current || canonical(current) !== canonical(c.row)) throw new Error('RECONCILIATION_REQUIRED', 409);
        }
        for (const own of state.typeFolderRows) {
            const current = snapshot.rows.CaseTypeFolders.find(r => Number(r.MilestoneId) === Number(own.MilestoneId) && Number(r.CaseTypeId) === Number(own.CaseTypeId));
            if (!current || canonical(current) !== canonical(own)) throw new Error('RECONCILIATION_REQUIRED', 409);
        }
        Preview.revalidate(state.previewText, state.expectedRevision, saved.content.request,
            Preparation.withoutOwned(state, snapshot), { ...saved.content.scope, participantContractIds });
    }
    static inserted(row: ContentRow | undefined, c: PreparationState['cases'][number], milestoneId: number) {
        if (!row || !Number.isSafeInteger(Number(row.Id)) || Number(row.Id) <= 0 ||
            Number(row.MilestoneId) !== milestoneId || Number(row.TypeId) !== c.typeId ||
            (row.ParentCaseId ?? null) !== c.parentId || (row.Name ?? null) !== c.name ||
            (row.Number ?? null) !== c.number || (row.SubCaseNumber ?? null) !== c.subCaseNumber || row.GdFolderId !== '')
            throw new Error('NUMBER_CONFLICT', 422);
    }
    static parent(file: any, id: string) {
        if (!id || id === 'root' || file?.id !== id || file.mimeType !== 'application/vnd.google-apps.folder' ||
            file.trashed !== false || file.capabilities?.canAddChildren !== true)
            throw new Error('DRIVE_STATE_UNCERTAIN', 409);
    }
    static folder(file: any, folder: PreparationFolder, parent: string, owner: string) {
        this.parent(file, folder.id!);
        if (file.parents?.length !== 1 || file.parents[0] !== parent || file.name !== folder.name ||
            (folder.owned && file.appProperties?.psConsolidationPreparation !== owner))
            throw new Error('DRIVE_STATE_UNCERTAIN', 409);
    }
    static aliases(rows: { table: string; key: string }[], allowed: { table: string; key: string }[]) {
        if (rows.some(r => !allowed.some(a => a.table === r.table && a.key === r.key))) throw new Error('FOLDER_ALIAS', 409);
    }
}
