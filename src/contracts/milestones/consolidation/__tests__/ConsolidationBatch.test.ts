import Batch from '../ConsolidationBatch';
import Validator from '../ConsolidationBatchValidator';
import Preview from '../ConsolidationPreview';
import type Effects from '../ConsolidationEffects';

const schema = require('./effectsSchemaFixture.json');
const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixture() {
    const snapshot: Parameters<typeof Effects.analyze>[1] = {
        ...JSON.parse(JSON.stringify(schema)), projectOurId: 'P', boundaryReferences: 0,
        parentScopeExpression: 'ifnull(`ParentCaseId`,0)', nameWeights: [], folderReferences: [], folderReferenceScope: 'SELECTED_PROJECT_ONLY',
        rows: {
            Projects: [{ Id: 1, OurId: 'P' }], Contracts: [{ Id: 10, ProjectOurId: 'P', TypeId: 1 }, { Id: 20, ProjectOurId: 'P', TypeId: 1 }],
            Milestones: [{ Id: 1, ContractId: 10, TypeId: 5, GdFolderId: 'mock:source' }, { Id: 2, ContractId: 20, TypeId: 5, GdFolderId: 'mock:dest' }],
            Cases: [{ Id: 100, MilestoneId: 1, TypeId: 50, ParentCaseId: null, GdFolderId: 'mock:case1', Description: 'ą'.repeat(140000) },
                { Id: 200, MilestoneId: 2, TypeId: 50, ParentCaseId: null, GdFolderId: 'mock:case2', Description: 'keep', Status: 'OPEN' }],
            Tasks: [{ Id: 1000, CaseId: 100, OwnerId: 7, HoursMon: '5.25', HoursTue: null, HoursWed: '0.00', HoursThu: null, HoursFri: null, EstimatedHours: '8.00' }],
            Tasks_Watchers: [{ TaskId: 1000, PersonId: 7 }],
            ProcessInstances: [{ Id: 30, CaseId: 100, TaskId: 1000 }],
            ProcessesStepsInstances: [{ Id: 40, ProcessInstanceId: 30, OurLetterId: 60 }],
            Risks: [{ Id: 50, CaseId: 100, ProjectOurId: 'P' }],
            Securities: [{ Id: 51, CaseId: 100, ContractId: 10 }],
            MeetingArrangements: [{ Id: 52, CaseId: 100, MeetingId: 70 }],
            Letters_Cases: [{ LetterId: 60, CaseId: 100 }, { LetterId: 60, CaseId: 200 }],
            Letters: [{ Id: 60, Description: 'keep letter' }],
            MilestoneContractLinks: [], CaseType_SubCaseTypes: [],
            CaseTypes: [{ Id: 50, MilestoneTypeId: 5, IsUniquePerMilestone: 0, IsSubCaseOnly: 0 }],
            MilestoneTypes_ContractTypes: [{ MilestoneTypeId: 5, ContractTypeId: 1 }],
        },
    };
    const mapping = { sourceMilestoneId: 1, destinationMilestoneId: 2,
        mappings: [{ sourceCaseId: 100, target: { mode: 'existing' as const, caseId: 200 } }] };
    const scope = { actorId: 7, projectOurId: 'P', participantContractIds: [10, 20] };
    const make = () => Preview.create(mapping, snapshot, scope);
    return { snapshot, mapping, make };
}
function body(p: ReturnType<typeof Preview.create>) {
    return { requestId, previewId: p.previewId, expectedRevision: p.revision, unitIds: p.units.map(u => u.unitId) };
}

it('plans full selected groups, preserves hours and content, but never authorizes execution', () => {
    const { make, snapshot } = fixture(), before = JSON.stringify(snapshot), p = make(), input = body(p);
    const serialized = Preview.serialize(p), result = Batch.prepare(serialized, input);
    expect(result.stage).toBe('BATCH_PLAN_ONLY'); expect(result.executable).toBe(false);
    expect(result.accountingContractId).toBe(20); expect(result.pendingUnitIds).toEqual([]);
    expect(result.taskMoves).toHaveLength(1);
    expect(result.taskMoves[0]).toMatchObject({ taskId: 1000, sourceCaseId: 100, destinationCaseId: 200,
        before: { OwnerId: 7, HoursMon: '5.25', HoursTue: null, HoursWed: '0.00', EstimatedHours: '8.00' } });
    expect(result.referenceMoves.map(r => r.table).sort()).toEqual(['MeetingArrangements', 'ProcessInstances', 'Risks', 'Securities']);
    expect(result.referenceMoves.find(r => r.table === 'Securities')!.before.ContractId).toBe(10);
    expect(result.letterEdges[0]).toMatchObject({ action: 'DEDUPLICATE_EXACT_EDGE', destinationCaseId: 200 });
    expect(result.sourceSnapshots.find(n => n.entity === 'Cases')!.record.Description).toHaveLength(140000);
    expect(result.destinationSnapshots[0]).toMatchObject({ Description: 'keep', Status: 'OPEN' });
    expect(result.snapshot.rows.Tasks_Watchers).toEqual(snapshot.rows.Tasks_Watchers);
    expect(result.snapshot.rows.ProcessesStepsInstances).toEqual(snapshot.rows.ProcessesStepsInstances);
    result.taskMoves[0].before.HoursMon = '99.00';
    expect(JSON.stringify(snapshot)).toBe(before); expect(Preview.serialize(p)).toBe(serialized);
});
it('leaves unselected metadata pending and does not copy its notes into a case batch', () => {
    const p = fixture().make(), input = body(p);
    input.unitIds = p.units.filter(u => u.unitKey.startsWith('cases:')).map(u => u.unitId);
    const result = Batch.prepare(Preview.serialize(p), input);
    expect(result.pendingUnitIds).toHaveLength(1); expect(result.sourceSnapshots.map(n => n.entity)).toEqual(['Cases']);
});
it('selects parent and subcase together using one dependency-unit identity', () => {
    const f = fixture();
    f.snapshot.rows.CaseTypes.push({ Id: 51, MilestoneTypeId: 5, IsUniquePerMilestone: 0, IsSubCaseOnly: 1 });
    f.snapshot.rows.CaseType_SubCaseTypes.push({ ParentCaseTypeId: 50, SubCaseTypeId: 51 });
    f.snapshot.rows.Cases.push({ Id: 101, MilestoneId: 1, TypeId: 51, ParentCaseId: 100, GdFolderId: 'mock:child1' },
        { Id: 201, MilestoneId: 2, TypeId: 51, ParentCaseId: 200, GdFolderId: 'mock:child2' });
    f.mapping.mappings.push({ sourceCaseId: 101, target: { mode: 'existing', caseId: 201 } });
    const p = f.make(), input = body(p);
    input.unitIds = p.units.filter(u => u.unitKey.startsWith('cases:')).map(u => u.unitId);
    expect(input.unitIds).toHaveLength(1);
    expect(Batch.prepare(Preview.serialize(p), input).caseMappings).toEqual([
        { sourceCaseId: 100, destinationCaseId: 200 }, { sourceCaseId: 101, destinationCaseId: 201 },
    ]);
});
it('canonicalizes request order/case without mutating the caller and fingerprints only payload', () => {
    const p = fixture().make(), a = body(p), b = { ...a, requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', unitIds: [...a.unitIds].reverse().map(id => id.toUpperCase()) };
    const before = JSON.stringify(b);
    expect(Batch.prepare(Preview.serialize(p), a).payloadHash).toBe(Batch.prepare(Preview.serialize(p), b).payloadHash);
    expect(JSON.stringify(b)).toBe(before);
    expect(Batch.prepare(Preview.serialize(p), { ...a, unitIds: [a.unitIds[0]] }).payloadHash).not.toBe(Batch.prepare(Preview.serialize(p), a).payloadHash);
});
it('rejects automatic proposals until the caller explicitly selects targets', () => {
    const f = fixture(); f.mapping.mappings = [];
    const p = f.make(); expect(() => Batch.prepare(Preview.serialize(p), body(p))).toThrow('INVALID_MAPPING');
});
it('rejects blocked selected groups while permitting independent metadata planning', () => {
    const f = fixture(); f.snapshot.rows.Tasks[0].HoursMon = 'NaN'; const p = f.make(), input = body(p);
    expect(() => Batch.prepare(Preview.serialize(p), input)).toThrow('DEPENDENCY_CONFLICT');
    input.unitIds = p.units.filter(u => u.unitKey.startsWith('milestone:')).map(u => u.unitId);
    expect(Batch.prepare(Preview.serialize(p), input).taskMoves).toEqual([]);
});
it('rejects stale revision, wrong preview and unknown unit identities', () => {
    const p = fixture().make(), input = body(p), saved = Preview.serialize(p);
    expect(() => Batch.prepare(saved, { ...input, expectedRevision: '0'.repeat(64) })).toThrow('STALE_REVISION');
    expect(() => Batch.prepare(saved, { ...input, previewId: requestId })).toThrow('STALE_REVISION');
    expect(() => Batch.prepare(saved, { ...input, unitIds: [requestId] })).toThrow('INVALID_REQUEST');
});
it.each([null, {}, [], { unitIds: [] }])('rejects malformed requests %#', value => {
    expect(() => Validator.request(value)).toThrow('INVALID_REQUEST');
});
it('rejects extra fields, empty or duplicate unit lists, sparse arrays and invalid UUIDs', () => {
    const input = body(fixture().make());
    for (const bad of [{ ...input, actorId: 9 }, { ...input, unitIds: [] }, { ...input, unitIds: [input.unitIds[0], input.unitIds[0].toUpperCase()] },
        { ...input, unitIds: [, input.unitIds[0]] }, { ...input, requestId: 'bad' }])
        expect(() => Validator.request(bad)).toThrow('INVALID_REQUEST');
});
