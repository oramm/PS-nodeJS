import type Batch from './ConsolidationBatch';
import type { EffectsSnapshot } from './ConsolidationEffectsRepository';
import { canonical } from './ConsolidationPreview';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';
import type Repository from './ConsolidationTransferRepository';

type Plan = ReturnType<typeof Batch.prepare>;
const sorted = (rows: unknown[]) => rows.map(row => canonical(row)).sort();

export default class ConsolidationTransferValidator {
    static storage(value: Awaited<ReturnType<Repository['storage']>>) {
        if (value.triggers.length || value.engines.length !== value.names.length ||
            value.names.some(name => !value.engines.some(row => row.name === name && row.engine === 'InnoDB')))
            throw new Error('UNHANDLED_REFERENCE', 422);
    }
    static affected(count: number) {
        if (count !== 1) throw new Error('DEPENDENCY_CONFLICT', 409);
    }
    /** Check the complete read set, including hours, notes, legal owners and unchanged references. */
    static reconcile(plan: Plan, after: EffectsSnapshot, linkContractId: number, timestamp: string) {
        const expected: EffectsSnapshot = JSON.parse(canonical(plan.snapshot));
        for (const move of plan.taskMoves)
            Object.assign(expected.rows.Tasks.find(row => Number(row.Id) === move.taskId)!,
                { CaseId: move.destinationCaseId, LastUpdated: timestamp });
        for (const move of plan.referenceMoves)
            Object.assign(expected.rows[move.table].find(row => Number(row.Id) === move.id)!,
                { CaseId: move.destinationCaseId, LastUpdated: timestamp });
        for (const edge of plan.letterEdges) {
            const rows = expected.rows.Letters_Cases;
            const index = rows.findIndex(row => Number(row.LetterId) === edge.letterId && Number(row.CaseId) === edge.sourceCaseId);
            if (index < 0) throw new Error('DEPENDENCY_CONFLICT', 409);
            if (edge.action === 'DEDUPLICATE_EXACT_EDGE') rows.splice(index, 1);
            else Object.assign(rows[index], { CaseId: edge.destinationCaseId, LastUpdated: timestamp });
        }
        const linkKey = (row: Record<string, unknown>) => Number(row.MilestoneId) === plan.destinationMilestoneId && Number(row.ContractId) === linkContractId;
        const hadLink = (expected.rows.MilestoneContractLinks || []).some(linkKey);
        if (!hadLink && linkContractId !== plan.accountingContractId) {
            const added = after.rows.MilestoneContractLinks.filter(linkKey);
            if (added.length !== 1 || added[0].ShortcutStatus !== 'PENDING' || added[0].OperationId != null || added[0].ShortcutId != null)
                throw new Error('DEPENDENCY_CONFLICT', 409);
            expected.rows.MilestoneContractLinks.push(added[0]);
        }
        if (canonical(Object.keys(expected.rows).sort()) !== canonical(Object.keys(after.rows).sort()))
            throw new Error('DEPENDENCY_CONFLICT', 409);
        for (const table of Object.keys(expected.rows))
            if (canonical(sorted(expected.rows[table])) !== canonical(sorted(after.rows[table])))
                throw new Error('DEPENDENCY_CONFLICT', 409);
        const { rows: _beforeRows, ...beforeMetadata } = expected;
        const { rows: _afterRows, ...afterMetadata } = after;
        // The reader has deterministic metadata ordering; no schema/folder/scope change is permitted.
        const normalize = (metadata: Record<string, unknown>) => Object.fromEntries(Object.entries(metadata)
            .map(([key, value]) => [key, Array.isArray(value) ? sorted(value) : value]));
        if (canonical(normalize(beforeMetadata)) !== canonical(normalize(afterMetadata))) throw new Error('DEPENDENCY_CONFLICT', 409);
    }
}
