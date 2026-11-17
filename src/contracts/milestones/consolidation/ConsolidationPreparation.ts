import { randomUUID } from 'crypto';
import Preview, { canonical } from './ConsolidationPreview';
import type { EffectsSnapshot } from './ConsolidationEffectsRepository';
import type { ContentRow } from './ConsolidationReadRepository';
import type { MappingRequest } from './ConsolidationMapping';

export type PreparationFolder = { key: string; id: string | null; parentKey: string | null;
    parentId: string | null; name: string; owned: boolean; attempted: boolean; ready: boolean;
    caseTypeId: number | null };
export type PreparationCase = { sourceId: number; typeId: number; parentSourceId: number | null;
    parentId: number | null; name: string | null; number: number | null; subCaseNumber: number | null;
    folderKey: string; row: ContentRow | null };
export type PreparationState = { id: string; actorId: number; requestId: string; previewId: string;
    expectedRevision: string; previewText: string; cases: PreparationCase[]; folders: PreparationFolder[];
    typeFolderRows: ContentRow[] };

/** Durable intent, never a claim that a remote effect was rolled back. */
export default class ConsolidationPreparation {
    static create(text: string, actorId: number, requestId: string): PreparationState {
        const p = Preview.restore(text), { request, snapshot, analysis } = p.content;
        const state: PreparationState = { id: randomUUID(), actorId, requestId, previewId: p.previewId,
            expectedRevision: p.revision, previewText: text, cases: [], folders: [], typeFolderRows: [] };
        const destination = snapshot.rows.Milestones.find(r => Number(r.Id) === request.destinationMilestoneId)!;
        const selected = request.mappings.filter(m => m.target.mode === 'create');
        const ordered: typeof selected = [], visiting = new Set<number>();
        const visit = (m: typeof selected[number]) => {
            if (ordered.includes(m)) return;
            if (visiting.has(m.sourceCaseId)) throw new Error('INVALID_PARENT_MAPPING');
            visiting.add(m.sourceCaseId);
            const target = m.target;
            const parent = target.mode === 'create' ? selected.find(p => p.sourceCaseId === target.parentSourceCaseId) : undefined;
            if (parent) visit(parent);
            ordered.push(m); visiting.delete(m.sourceCaseId);
        };
        [...selected].sort((a,b) => a.sourceCaseId-b.sourceCaseId).forEach(visit);
        const pending = [...ordered];
        while (pending.length) {
            const mapping = pending.shift()!, target = mapping.target;
            if (target.mode !== 'create') continue;
            const proposal = analysis.numbers.find(n => n.sourceCaseId === mapping.sourceCaseId)!;
            const type = snapshot.rows.CaseTypes.find(t => Number(t.Id) === target.caseTypeId)!;
            const parentTarget = request.mappings.find(m => m.sourceCaseId === target.parentSourceCaseId)?.target;
            const parentId = parentTarget?.mode === 'existing' ? parentTarget.caseId : null;
            const parentCase = parentId === null ? null : snapshot.rows.Cases.find(c => Number(c.Id) === parentId);
            const uniqueRoot = target.parentSourceCaseId === null && !!Number(type.IsUniquePerMilestone);
            const typeKey = `type:${target.caseTypeId}`;
            if (target.parentSourceCaseId === null && !state.folders.some(f => f.key === typeKey)) {
                const cached = snapshot.rows.CaseTypeFolders.find(r => Number(r.MilestoneId) === request.destinationMilestoneId && Number(r.CaseTypeId) === target.caseTypeId);
                state.folders.push({ key: typeKey, id: cached ? String(cached.GdFolderId) : null,
                    parentKey: null, parentId: String(destination.GdFolderId), name: `${type.FolderNumber} ${type.Name}`,
                    owned: !cached, attempted: false, ready: false, caseTypeId: uniqueRoot ? null : target.caseTypeId });
            }
            const folderKey = uniqueRoot ? typeKey : `case:${mapping.sourceCaseId}`;
            const parentNumber = target.parentSourceCaseId === null ? null :
                state.cases.find(c => c.sourceId === target.parentSourceCaseId)?.number ?? Number(parentCase?.Number ?? 0);
            const pad = (n: number | null) => String(n ?? 0).padStart(2, '0');
            if (!uniqueRoot) state.folders.push({ key: folderKey, id: null,
                parentKey: target.parentSourceCaseId === null ? typeKey : parentId === null ? state.cases.find(c => c.sourceId === target.parentSourceCaseId)!.folderKey : null,
                parentId: parentId === null ? null : String(parentCase!.GdFolderId),
                name: Number(type.IsUniquePerMilestone) ? `${type.FolderNumber} ${type.Name}` :
                    `S${target.parentSourceCaseId === null ? pad(proposal.number) : `${pad(parentNumber)}.${pad(proposal.subCaseNumber)}`}${proposal.name ? ' ' + proposal.name : ''}`,
                owned: true, attempted: false, ready: false, caseTypeId: null });
            state.cases.push({ sourceId: mapping.sourceCaseId, typeId: target.caseTypeId,
                parentSourceId: target.parentSourceCaseId, parentId, name: proposal.name,
                number: proposal.number, subCaseNumber: proposal.subCaseNumber, folderKey, row: null });
        }
        return state;
    }
    static request(state: PreparationState): MappingRequest {
        const request = Preview.restore(state.previewText).content.request;
        return { ...request, mappings: request.mappings.map(m => {
            const created = state.cases.find(c => c.sourceId === m.sourceCaseId);
            return created?.row ? { sourceCaseId: m.sourceCaseId, target: { mode: 'existing' as const, caseId: Number(created.row.Id) } } : m;
        }) };
    }
    static withoutOwned(state: PreparationState, input: EffectsSnapshot): EffectsSnapshot {
        const snapshot: EffectsSnapshot = JSON.parse(canonical(input));
        const ownIds = new Set(state.cases.filter(c => c.row).map(c => Number(c.row!.Id)));
        snapshot.rows.Cases = snapshot.rows.Cases.filter(r => !ownIds.has(Number(r.Id)));
        const request = Preview.restore(state.previewText).content.request;
        const typeIds = new Set(state.typeFolderRows.map(r => Number(r.CaseTypeId)));
        snapshot.rows.CaseTypeFolders = snapshot.rows.CaseTypeFolders.filter(r => !(Number(r.MilestoneId) === request.destinationMilestoneId && typeIds.has(Number(r.CaseTypeId))));
        snapshot.folderReferences = snapshot.folderReferences.filter(r => !(r.table === 'Cases' && ownIds.has(Number(r.key))) &&
            !(r.table === 'CaseTypeFolders' && r.milestoneId === request.destinationMilestoneId && typeIds.has(Number(r.key.split(':')[1]))));
        return snapshot;
    }
}
