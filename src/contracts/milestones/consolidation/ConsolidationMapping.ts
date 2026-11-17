import { ConsolidationMappingError } from './ConsolidationMappingValidator';

export type MappingTarget = { mode: 'existing'; caseId: number } | {
    mode: 'create'; caseTypeId: number; name: string; parentSourceCaseId: number | null;
};
export type MappingRequest = {
    operationId?: string;
    sourceMilestoneId: number;
    destinationMilestoneId: number;
    mappings: { sourceCaseId: number; target: MappingTarget }[];
};
export type MappingCase = {
    id: number; milestoneId: number; caseTypeId: number; parentCaseId: number | null;
};
export type MappingCaseType = {
    id: number; isUniquePerMilestone: boolean; isSubCaseOnly: boolean; allowedSubCaseTypeIds: readonly number[];
};
export type MappingResult = {
    sourceCaseId: number;
    target: MappingTarget | null;
    candidateCaseIds: number[];
    state: 'SELECTED' | 'PROPOSED' | 'BLOCKED';
    conflictCodes: string[];
};

/** Pure mapping only. SELECTED/PROPOSED do not certify dependencies, numbering or transfer readiness. */
export default class ConsolidationMapping {
    static resolve(request: MappingRequest, source: readonly MappingCase[], destination: readonly MappingCase[],
        types: readonly MappingCaseType[]): MappingResult[] {
        const sources = new Map(source.map(row => [row.id, row]));
        const destinations = new Map(destination.map(row => [row.id, row]));
        const dictionary = new Map(types.map(row => [row.id, row]));
        const selected = new Map(request.mappings.map(row => [row.sourceCaseId, row.target]));
        if (request.sourceMilestoneId === request.destinationMilestoneId ||
            sources.size !== source.length || destinations.size !== destination.length ||
            dictionary.size !== types.length || selected.size !== request.mappings.length ||
            source.some(row => row.milestoneId !== request.sourceMilestoneId || destinations.has(row.id)) ||
            destination.some(row => row.milestoneId !== request.destinationMilestoneId) ||
            request.mappings.some(row => !sources.has(row.sourceCaseId)))
            throw new ConsolidationMappingError('INVALID_MAPPING');

        const results = new Map<number, MappingResult>();
        const visiting = new Set<number>();
        const resolve = (row: MappingCase): MappingResult => {
            const previous = results.get(row.id);
            if (previous) return previous;
            const result: MappingResult = { sourceCaseId: row.id, target: null,
                candidateCaseIds: [], state: 'BLOCKED', conflictCodes: [] };
            const block = (code: string) => {
                if (!result.conflictCodes.includes(code)) result.conflictCodes.push(code);
                result.state = 'BLOCKED';
                return result;
            };
            if (visiting.has(row.id)) return block('INVALID_PARENT_MAPPING');
            visiting.add(row.id);
            const type = dictionary.get(row.caseTypeId);
            let parent: MappingResult | undefined;
            if (row.parentCaseId !== null) {
                const parentRow = sources.get(row.parentCaseId);
                if (!parentRow) block('INVALID_PARENT_MAPPING');
                else {
                    parent = resolve(parentRow);
                    if (parent.state === 'BLOCKED' ||
                        !dictionary.get(parentRow.caseTypeId)?.allowedSubCaseTypeIds.includes(row.caseTypeId))
                        block('INVALID_PARENT_MAPPING');
                }
            } else if (type?.isSubCaseOnly) block('INVALID_PARENT_MAPPING');
            if (!type) block('TYPE_UNAVAILABLE');

            // Match within the mapped parent only. A proposed new parent has no existing children.
            const parentTarget = parent?.target;
            const parentId = row.parentCaseId === null ? null
                : parentTarget?.mode === 'existing' ? parentTarget.caseId : undefined;
            if (!result.conflictCodes.length) {
                result.candidateCaseIds = destination.filter(candidate =>
                    candidate.caseTypeId === row.caseTypeId && parentId !== undefined &&
                    candidate.parentCaseId === parentId).map(candidate => candidate.id).sort((a, b) => a - b);
                const target = selected.get(row.id);
                if (target?.mode === 'existing') {
                    if (!result.candidateCaseIds.includes(target.caseId)) block('INVALID_MAPPING');
                    else { result.target = { ...target }; result.state = 'SELECTED'; }
                } else if (target?.mode === 'create') {
                    if (target.caseTypeId !== row.caseTypeId) block('TYPE_MISMATCH');
                    if (target.parentSourceCaseId !== row.parentCaseId) block('INVALID_PARENT_MAPPING');
                    if (type?.isUniquePerMilestone && target.name !== '') block('INVALID_MAPPING');
                    if (type?.isUniquePerMilestone && row.parentCaseId === null && (
                        destination.some(candidate => candidate.caseTypeId === row.caseTypeId && candidate.parentCaseId === null) ||
                        request.mappings.some(other => other.sourceCaseId !== row.id && other.target.mode === 'create' &&
                            other.target.caseTypeId === row.caseTypeId && other.target.parentSourceCaseId === null)))
                        block('UNIQUE_TYPE_CONFLICT');
                    if (!result.conflictCodes.length) { result.target = { ...target }; result.state = 'SELECTED'; }
                } else if (result.candidateCaseIds.length === 1) {
                    result.target = { mode: 'existing', caseId: result.candidateCaseIds[0] };
                    result.state = 'PROPOSED';
                } else block(result.candidateCaseIds.length ? 'AMBIGUOUS_MAPPING' : 'MISSING_DESTINATION');
            }
            visiting.delete(row.id);
            results.set(row.id, result);
            return result;
        };
        // Stable output and proposals regardless of query ordering; inputs stay untouched.
        return [...source].sort((a, b) => a.id - b.id).map(resolve);
    }
}
