import Id from './ConsolidationNoteValidator';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';

export default class ConsolidationWriteGuardValidator {
    static structure(kind: 'milestone' | 'case' | 'contract' | 'project', rows: any[], dto?: any, fields?: string[]) {
        if (!rows.length) return;
        if (!dto) return this.writable(rows);
        // Only these partial writes skip external effects. Other edits may use the full folder context.
        const dbOnly: string[] = {
            milestone: ['status', 'description', 'number', 'name'],
            case: ['status', 'description'],
            contract: ['status', 'comment', 'startDate', 'endDate', 'guaranteeEndDate', 'warrantyEndDate', 'defectsNotificationEndDate', 'value', 'name'],
            project: [],
        }[kind];
        const selected = fields?.length && fields.every(field => dbOnly.includes(field)) ? fields : undefined;
        const columns = {
            milestone: { contractId: 'ContractId', typeId: 'TypeId', offerId: 'OfferId', gdFolderId: 'GdFolderId' },
            case: { milestoneId: 'MilestoneId', parentCaseId: 'ParentCaseId', typeId: 'TypeId', gdFolderId: 'GdFolderId' },
            contract: { projectOurId: 'ProjectOurId', typeId: 'TypeId', gdFolderId: 'GdFolderId', ourIdRelated: 'OurIdRelated' },
            project: { ourId: 'OurId', gdFolderId: 'GdFolderId' },
        }[kind];
        for (const row of rows) for (const [field, column] of Object.entries(columns)) {
            if ((!selected || selected.includes(field)) && dto[field] !== undefined &&
                (dto[field] ?? null) !== (row[column] ?? null)) this.writable(rows);
        }
    }
    static standalone(connection: unknown, inTransaction?: boolean) {
        if (connection || inTransaction) throw new Error('NESTED_LIFECYCLE_WRITE', 409);
    }
    static complete(ids: number[], rows: { Id: number }[]) {
        if (rows.length !== ids.length || new Set(rows.map(r => Number(r.Id))).size !== ids.length ||
            rows.some(r => !ids.includes(Number(r.Id)))) throw new Error('OBJECT_NOT_FOUND', 404);
    }
    static ids(values: readonly unknown[]) { return [...new Set(values.map(v => Id.id(v)))].sort((a,b) => a-b); }
    static parents(ids: number[], rows: { Id: number; MilestoneId: number }[]) {
        if (rows.length !== ids.length || rows.some(r => !ids.includes(Number(r.Id)))) throw new Error('OBJECT_NOT_FOUND',404);
        return this.ids(rows.map(r => Number(r.MilestoneId)));
    }
    static writable(operations: unknown[]) {
        if (operations.length) throw new Error('OPERATION_IN_PROGRESS',409);
    }
}
