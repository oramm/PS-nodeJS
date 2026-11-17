import Mapping, { MappingCase, MappingCaseType, MappingRequest } from '../ConsolidationMapping';
import Validator from '../ConsolidationMappingValidator';

const root = (id: number, milestoneId = 1, caseTypeId = 10, parentCaseId: number | null = null): MappingCase =>
    ({ id, milestoneId, caseTypeId, parentCaseId });
const types: MappingCaseType[] = [
    { id: 10, isUniquePerMilestone: false, isSubCaseOnly: false, allowedSubCaseTypeIds: [11] },
    { id: 11, isUniquePerMilestone: false, isSubCaseOnly: true, allowedSubCaseTypeIds: [] },
    { id: 12, isUniquePerMilestone: true, isSubCaseOnly: false, allowedSubCaseTypeIds: [] },
];
const body = (mappings: MappingRequest['mappings'] = []) => ({ sourceMilestoneId: 1, destinationMilestoneId: 2, mappings });
const existing = (sourceCaseId: number, caseId: number) => ({ sourceCaseId, target: { mode: 'existing' as const, caseId } });
const create = (sourceCaseId: number, caseTypeId = 10, parentSourceCaseId: number | null = null, name = '') =>
    ({ sourceCaseId, target: { mode: 'create' as const, caseTypeId, parentSourceCaseId, name } });
const resolve = (source: MappingCase[], destination: MappingCase[], mappings: MappingRequest['mappings'] = [], dictionary = types) =>
    Mapping.resolve(Validator.request(body(mappings)), source, destination, dictionary);

describe('consolidation request boundary', () => {
    it('accepts initial discovery and explicit selections without mutating payload', () => {
        expect(Validator.request(body())).toEqual(body());
        const input = body([existing(3, 4), create(5, 11, 3, 'Podsprawa')]);
        const parsed = Validator.request(input);
        expect(parsed).toEqual(input);
        expect(parsed.mappings[0].target).not.toBe(input.mappings[0].target);
    });
    it.each([null, [], {}, { ...body(), sourceMilestoneId: '1' }, { ...body(), sourceMilestoneId: 0 },
        { ...body(), sourceMilestoneId: 2147483648 }, { ...body(), destinationMilestoneId: 1 },
        { ...body(), actorId: 1 }, { ...body(), operationId: 'unsupported' },
        { ...body(), mappings: null }, body([existing(3, 4), existing(3, 5)]),
        body([{ sourceCaseId: 3, target: { mode: 'existing', caseId: 4, name: 'extra' } } as any]),
        body([{ sourceCaseId: 3, target: { mode: 'create', caseTypeId: 10, name: '' } } as any]),
        body([create(3, 10, 3)]), body([create(3, 10, null, null as any)]),
        body([{ sourceCaseId: true, target: { mode: 'existing', caseId: 4 } } as any]),
    ])('rejects malformed, ambiguous or untrusted fields: %j', input => {
        expect(() => Validator.request(input)).toThrow();
    });
});

describe('mapping is not permission to transfer', () => {
    it('proposes the only compatible type, never matches by name', () => {
        const source = [{ ...root(3), name: 'same' }];
        const destination = [{ ...root(4, 2), name: 'different' }, { ...root(5, 2, 12), name: 'same' }];
        expect(resolve(source, destination)[0]).toMatchObject({ state: 'PROPOSED', target: { caseId: 4 } });
    });
    it('requires selection among same-type candidates even with identical names', () => {
        const dest = [{ ...root(4, 2), name: 'same' }, { ...root(5, 2), name: 'same' }];
        expect(resolve([root(3)], dest)[0]).toMatchObject({ state: 'BLOCKED', candidateCaseIds: [4, 5], conflictCodes: ['AMBIGUOUS_MAPPING'] });
        expect(resolve([root(3)], dest, [existing(3, 5)])[0]).toMatchObject({ state: 'SELECTED', target: { caseId: 5 } });
    });
    it('retains missing destinations and empty source cases until explicit create', () => {
        expect(resolve([root(3)], [])[0].conflictCodes).toEqual(['MISSING_DESTINATION']);
        expect(resolve([root(3)], [], [create(3)])[0]).toMatchObject({ state: 'SELECTED', target: { mode: 'create' } });
    });
    it('permits many source cases to select one destination, without deduplicating source identities', () => {
        expect(resolve([root(3), root(4)], [root(5, 2)], [existing(3, 5), existing(4, 5)]).map(r => r.state))
            .toEqual(['SELECTED', 'SELECTED']);
    });
    it('maps subcases only beneath the mapped parent, irrespective of source ordering', () => {
        const result = resolve([root(3, 1, 11, 4), root(4)], [root(6, 2, 11, 5), root(5, 2), root(7, 2, 11, 8)]);
        expect(result[0]).toMatchObject({ state: 'PROPOSED', target: { caseId: 6 }, candidateCaseIds: [6] });
    });
    it('cannot flatten a child or put it under another destination parent', () => {
        const result = resolve([root(3), root(4, 1, 11, 3)], [root(5, 2), root(6, 2, 11), root(7, 2, 11, 8)], [existing(4, 7)]);
        expect(result[1].state).toBe('BLOCKED');
        expect(resolve([root(3), root(4, 1, 11, 3)], [root(5, 2)], [create(4, 11)])[1].conflictCodes)
            .toContain('INVALID_PARENT_MAPPING');
    });
    it('allows explicit creation beneath a newly proposed parent without inventing destination IDs', () => {
        const result = resolve([root(3), root(4, 1, 11, 3)], [], [create(3), create(4, 11, 3)]);
        expect(result.map(row => row.state)).toEqual(['SELECTED', 'SELECTED']);
        expect(result[1].target).toEqual(create(4, 11, 3).target);
    });
    it('does not auto-create or use an unrelated child when its parent will be new', () => {
        expect(resolve([root(3), root(4, 1, 11, 3)], [root(5, 2, 11, 6)], [create(3)])[1])
            .toMatchObject({ state: 'BLOCKED', candidateCaseIds: [], conflictCodes: ['MISSING_DESTINATION'] });
    });
    it('blocks descendants of unresolved parents while an independent root remains proposed', () => {
        const result = resolve([root(3), root(4, 1, 11, 3), root(5, 1, 12)], [root(6, 2), root(7, 2), root(8, 2, 12)]);
        expect(result.map(r => r.state)).toEqual(['BLOCKED', 'BLOCKED', 'PROPOSED']);
    });
    it('rejects orphan, cyclic and dictionary-disallowed hierarchies without recursion failure', () => {
        expect(resolve([root(3, 1, 11, 99)], [])[0].conflictCodes).toContain('INVALID_PARENT_MAPPING');
        const cycleTypes = [{ ...types[0], allowedSubCaseTypeIds: [10] }];
        expect(resolve([root(3, 1, 10, 4), root(4, 1, 10, 3)], [], [], cycleTypes).every(r => r.state === 'BLOCKED')).toBe(true);
        expect(resolve([root(3, 1, 11)], [])[0].conflictCodes).toContain('INVALID_PARENT_MAPPING');
        expect(resolve([root(3, 1, 12), root(4, 1, 11, 3)], [root(5, 2, 12)])[1].conflictCodes).toContain('INVALID_PARENT_MAPPING');
    });
    it('rejects missing dictionary type, wrong existing type and wrong create type', () => {
        expect(resolve([root(3, 1, 99)], [])[0].conflictCodes).toContain('TYPE_UNAVAILABLE');
        expect(resolve([root(3)], [root(4, 2, 12)], [existing(3, 4)])[0].state).toBe('BLOCKED');
        expect(resolve([root(3)], [], [create(3, 12)])[0].conflictCodes).toContain('TYPE_MISMATCH');
    });
    it('blocks duplicate unique creation against existing and other planned roots', () => {
        expect(resolve([root(3, 1, 12)], [root(4, 2, 12)], [create(3, 12)])[0].conflictCodes).toContain('UNIQUE_TYPE_CONFLICT');
        const result = resolve([root(3, 1, 12), root(4, 1, 12)], [], [create(3, 12), create(4, 12)]);
        expect(result.every(r => r.conflictCodes.includes('UNIQUE_TYPE_CONFLICT'))).toBe(true);
        expect(resolve([root(3, 1, 12)], [], [create(3, 12, null, 'name')])[0].state).toBe('BLOCKED');
    });
    it('allows one unnamed unique create', () => {
        expect(resolve([root(3, 1, 12)], [], [create(3, 12)])[0].state).toBe('SELECTED');
    });
    it('rejects incomplete/wrong server scope and extraneous source selections', () => {
        expect(() => resolve([root(3, 9)], [])).toThrow('INVALID_MAPPING');
        expect(() => resolve([root(3)], [root(4, 9)])).toThrow('INVALID_MAPPING');
        expect(() => resolve([root(3)], [], [create(99)])).toThrow('INVALID_MAPPING');
        expect(() => resolve([root(3), root(3)], [])).toThrow('INVALID_MAPPING');
    });
    it('is deterministic and leaves server data and explicit choices untouched', () => {
        const source = [root(4, 1, 11, 3), root(3)];
        const destination = [root(6, 2, 11, 5), root(5, 2)];
        const mapping = [existing(3, 5)];
        const before = JSON.stringify({ source, destination, mapping, types });
        const first = resolve(source, destination, mapping);
        expect(resolve([...source].reverse(), [...destination].reverse(), mapping)).toEqual(first);
        expect(JSON.stringify({ source, destination, mapping, types })).toBe(before);
        expect(first.every(r => !('unitId' in r) && r.state !== ('READY' as any))).toBe(true);
    });
});
