import type { SqlContentSnapshot } from './ConsolidationReadRepository';
import type { OperationState } from './ConsolidationOperation';
import Coverage from './ConsolidationReadCoverage';

export type ReadinessBlocker = { code: string; reference: string };
export const folderMime = 'application/vnd.google-apps.folder';
export const shortcutMime = 'application/vnd.google-apps.shortcut';

/** Point-in-time assessment only. A successful check never authorizes deletion. */
export default class ConsolidationReadiness {
    static inspect(state: OperationState, sql: SqlContentSnapshot) {
        const blockers: ReadinessBlocker[] = [...Coverage.inspect(sql).blockers];
        const block = (code: string, reference = '') => blockers.push({ code, reference });
        const rows = (table: string) => sql.rows[table] || [];
        const source = rows('Milestones').find(r => Number(r.Id) === state.sourceMilestoneId);
        const destination = rows('Milestones').find(r => Number(r.Id) === state.destinationMilestoneId);
        if (!source || !destination || source.Id === destination.Id) block('MAPPING_CHANGED', 'Milestones');
        if (sql.projectOurId !== state.projectOurId || Number(destination?.ContractId) !== state.accountingContractId)
            block('MAPPING_CHANGED', 'accounting-contract');
        if (!state.units.length || state.units.some(u => !u.moved)) block('TRANSFER_PENDING');
        const cases = rows('Cases').filter(r => Number(r.MilestoneId) === state.sourceMilestoneId);
        const ids = new Set(cases.map(r => Number(r.Id)));
        if (new Set(state.caseMappings.map(m => m.sourceCaseId)).size !== state.caseMappings.length ||
            cases.length !== state.caseMappings.length) block('MAPPING_CHANGED', 'Cases');
        for (const m of state.caseMappings) if (!ids.has(m.sourceCaseId) || !rows('Cases').some(r =>
            Number(r.Id) === m.destinationCaseId && Number(r.MilestoneId) === state.destinationMilestoneId))
            block('MAPPING_CHANGED', `Cases:${m.sourceCaseId}`);
        const removable = new Set(['Cases', 'MilestoneDates', 'CaseTypeFolders', 'MilestoneSharingState']);
        for (const [table, data] of Object.entries(sql.rows)) if (!removable.has(table) && table !== 'Milestones')
            for (const r of data) if (ids.has(Number(r.CaseId)) || Number(r.MilestoneId) === state.sourceMilestoneId ||
                (table === 'Cases' && ids.has(Number(r.ParentCaseId)))) block('PS_DEPENDENCY', `${table}:${r.Id ?? r.CaseId ?? r.MilestoneId}`);
        // Cross-tree children cannot be erased as if they belonged to the source tree.
        for (const r of rows('Cases')) if (!ids.has(Number(r.Id)) && ids.has(Number(r.ParentCaseId)))
            block('PS_DEPENDENCY', `Cases:${r.Id}:ParentCaseId`);
        const storedFolders = [source, ...cases, ...rows('CaseTypeFolders').filter(r => Number(r.MilestoneId) === state.sourceMilestoneId)]
            .filter(Boolean).map(r => String(r!.GdFolderId || ''));
        if (storedFolders.some(id => !/^[A-Za-z0-9_-]+$/.test(id))) block('SOURCE_FOLDER_NOT_READY');
        const destinations = [destination, ...state.caseMappings.map(m => rows('Cases').find(r => Number(r.Id) === m.destinationCaseId))]
            .filter(Boolean).map(r => String(r!.GdFolderId || ''));
        if (destinations.some(id => !/^[A-Za-z0-9_-]+$/.test(id))) block('DESTINATION_NOT_READY');
        if (source?.GdFolderId && source.GdFolderId === destination?.GdFolderId) block('FOLDER_IN_USE', String(source.GdFolderId));
        const removableReferences = new Set([
            `Milestones:${state.sourceMilestoneId}`, ...cases.map(r => `Cases:${r.Id}`),
            ...rows('CaseTypeFolders').filter(r => Number(r.MilestoneId) === state.sourceMilestoneId)
                .map(r => `CaseTypeFolders:${r.MilestoneId}:${r.CaseTypeId}`),
        ]);
        return { blockers, sourceFolderId: String(source?.GdFolderId || ''), destinationFolderId: String(destination?.GdFolderId || ''),
            storedFolders: [...new Set(storedFolders.filter(Boolean))], destinationFolders: [...new Set(destinations.filter(Boolean))], removableReferences };
    }
}
