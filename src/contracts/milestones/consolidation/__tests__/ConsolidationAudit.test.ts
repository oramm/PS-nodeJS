import Audit from '../ConsolidationAudit';
import Repository from '../ConsolidationAuditRepository';
import Preview from '../ConsolidationPreview';
import { createHash } from 'crypto';

const operation = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixture() {
    const snapshot: any = { ...require('./effectsSchemaFixture.json'), projectOurId: 'P', boundaryReferences: 0,
        parentScopeExpression: 'ifnull(`ParentCaseId`,0)', nameWeights: [], folderReferences: [], folderReferenceScope: 'SELECTED_PROJECT_ONLY', rows: {
            Projects: [{ Id: 1, OurId: 'P' }], Contracts: [{ Id: 10, ProjectOurId: 'P', TypeId: 1 }, { Id: 20, ProjectOurId: 'P', TypeId: 1 }],
            Milestones: [{ Id: 1, ContractId: 10, TypeId: 5, GdFolderId: 'mock:source', Description: 'ą'.repeat(139998) + '🙂' }, { Id: 2, ContractId: 20, TypeId: 5, GdFolderId: 'mock:target' }],
            Cases: [], Tasks: [], ProcessInstances: [], MilestoneContractLinks: [], CaseTypes: [], CaseType_SubCaseTypes: [],
            MilestoneTypes_ContractTypes: [{ MilestoneTypeId: 5, ContractTypeId: 1 }],
        } };
    const p = Preview.create({ sourceMilestoneId: 1, destinationMilestoneId: 2, mappings: [] }, snapshot,
        { actorId: 7, projectOurId: 'P', participantContractIds: [10, 20] });
    const input = { requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', previewId: p.previewId,
        expectedRevision: p.revision, unitIds: p.units.map(u => u.unitId) };
    const after = JSON.parse(JSON.stringify(p.content.snapshot));
    after.rows.MilestoneContractLinks.push({ MilestoneId: 2, ContractId: 10 });
    return { p, input, after, make: () => Audit.create(Preview.serialize(p), input, operation, 8, after) };
}
it('retains full before/after, plan, participant provenance and current actor without mutating input', () => {
    const f = fixture(), original = JSON.stringify(f.after), audit = f.make(), content = JSON.parse(audit.snapshotJSON);
    expect(content.before.content.snapshot.rows.Milestones[0].Description).toHaveLength(140000);
    expect(content.before.content.scope.actorId).toBe(7); expect(content.actorId).toBe(8);
    expect(content.before.content.scope.participantContractIds).toEqual([10, 20]);
    expect(content.after.rows.MilestoneContractLinks).toEqual([{ MilestoneId: 2, ContractId: 10 }]);
    expect(content.plan.selectedUnitIds).toEqual(f.input.unitIds);
    expect(audit.contentHash).toBe(createHash('sha256').update(audit.snapshotJSON).digest('hex'));
    f.after.rows.Milestones[0].Description = 'later mutation';
    expect(JSON.parse(audit.snapshotJSON).after).toEqual(JSON.parse(original));
});
it('is deterministic for the same request and changes its integrity hash when post-state changes', () => {
    const f = fixture(), a = f.make();
    expect(Audit.create(Preview.serialize(f.p), f.input, operation.toUpperCase(), 8, f.after)).toEqual(a);
    f.after.rows.Milestones[0].Description += 'x';
    expect(f.make().contentHash).not.toBe(a.contentHash);
});
it.each(['project', 'missing-table', 'missing-schema', 'lossy', 'null-rows'])('refuses incomplete or wrong post-state: %s', kind => {
    const f = fixture();
    if (kind === 'project') f.after.projectOurId = 'Q';
    if (kind === 'missing-table') delete f.after.rows.Tasks;
    if (kind === 'missing-schema') delete f.after.columns;
    if (kind === 'lossy') f.after.rows.Tasks.push({ HoursMon: undefined });
    if (kind === 'null-rows') f.after.rows = null;
    expect(f.make).toThrow('INVALID_SNAPSHOT');
});
it('rejects stale request and invalid operation/actor before materializing audit', () => {
    const f = fixture();
    expect(() => Audit.create(Preview.serialize(f.p), f.input, 'bad', 8, f.after)).toThrow('INVALID_REQUEST');
    expect(() => Audit.create(Preview.serialize(f.p), f.input, operation, 0, f.after)).toThrow('INVALID_SNAPSHOT');
    f.input.expectedRevision = '0'.repeat(64); expect(f.make).toThrow('STALE_REVISION');
});
it('inserts full evidence once on supplied connection and propagates duplicate refusal', async () => {
    const a = fixture().make(), query = jest.fn().mockResolvedValue([{}]), conn: any = { query }, repo = new Repository();
    await repo.add(a, conn);
    expect(query.mock.calls[0][0]).toMatch(/^INSERT INTO MilestoneConsolidationBatches/);
    expect(query.mock.calls[0][0]).not.toMatch(/IGNORE|REPLACE|ON DUPLICATE/i);
    expect(query.mock.calls[0][1]).toEqual([a.operationId, 8, a.requestId, a.previewId, 'P', 1, 2, a.beforeRevision, a.contentHash, a.snapshotJSON]);
    query.mockRejectedValue({ code: 'ER_DUP_ENTRY' });
    await expect(repo.add(a, conn)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
});
it('reads headers separately from full content using exact operation/actor/request identity', async () => {
    const a = fixture().make(), query = jest.fn().mockResolvedValueOnce([[{ OperationId: operation }]])
        .mockResolvedValueOnce([[{ SnapshotJSON: a.snapshotJSON }]]).mockResolvedValueOnce([[]]);
    const repo = new Repository(), conn: any = { query };
    expect(await repo.headers(operation, conn)).toEqual([{ OperationId: operation }]);
    expect(query.mock.calls[0][0]).toMatchObject({ dateStrings: true });
    expect(query.mock.calls[0][0].sql).not.toContain('SnapshotJSON');
    expect(await repo.content(operation, 8, a.requestId, conn)).toBe(a.snapshotJSON);
    expect(query.mock.calls[1][1]).toEqual([operation, 8, a.requestId]);
    expect(await repo.content(operation, 8, a.requestId, conn)).toBeUndefined();
});
