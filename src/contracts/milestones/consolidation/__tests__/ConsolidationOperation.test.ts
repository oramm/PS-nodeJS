import Operation from '../ConsolidationOperation';
import Repository from '../ConsolidationOperationRepository';
import Preview from '../ConsolidationPreview';
import { operationFixture } from './operationFixture';
const op = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function setup() {
    const f = operationFixture(), p = f.make();
    const record = Operation.first(Preview.serialize(p), f.body(p, false), op, 8);
    return { f, p, record };
}
it('retains stable operation, unit identities, mapping and participant provenance across two batches', () => {
    const { f, record } = setup(), before = JSON.stringify(record), next = f.make();
    const a = Operation.restore(record);
    expect(a.units.filter(u => u.moved)).toHaveLength(1);
    const updated = Operation.advance(record, record.revision, Preview.serialize(next), f.body(next, true), 9);
    const b = Operation.restore(updated);
    expect(b.units.every(u => u.moved)).toBe(true); expect(b.units.map(u => u.unitId)).toEqual(a.units.map(u => u.unitId));
    expect(b.actorId).toBe(8); expect(b.batches.map(x => x.actorId)).toEqual([8, 9]);
    expect(b.caseMappings).toEqual([{ sourceCaseId: 1900000001, destinationCaseId: 1900000002 }]);
    expect(b.participantContractIds).toEqual([1900000001, 1900000002]); expect(b.state).toBe('TRANSFERRING');
    expect(updated.revision).not.toBe(record.revision); expect(JSON.stringify(record)).toBe(before);
});
it('refuses stale operation revision before preparing another batch', () => {
    const { f, p, record } = setup();
    expect(() => Operation.advance(record, '0'.repeat(64), Preview.serialize(p), f.body(p, true), 8)).toThrow('STALE_REVISION');
});
it('refuses a second effect for a moved unit; replay must be resolved by receipt', () => {
    const { f, p, record } = setup();
    expect(() => Operation.advance(record, record.revision, Preview.serialize(p), f.body(p, false), 8)).toThrow('IDEMPOTENCY_CONFLICT');
});
it.each(['revision', 'snapshotJSON', 'sourceMilestoneId', 'state'])('rejects corrupted persisted %s', field => {
    const { record } = setup();
    const bad: any = { ...record, [field]: field === 'sourceMilestoneId' ? 3 : 'changed' };
    expect(() => Operation.restore(bad)).toThrow('SNAPSHOT_INTEGRITY_ERROR');
});
it('rejects changed dependency grouping instead of replacing historical identities', () => {
    const { f, record } = setup(); f.snapshot.rows.Cases = []; const next = Preview.create({ sourceMilestoneId: 1900000001, destinationMilestoneId: 1900000002, mappings: [] },f.snapshot,{ actorId:7,projectOurId:f.snapshot.projectOurId,participantContractIds:[1900000001,1900000002] });
    expect(() => Operation.advance(record,record.revision,Preview.serialize(next),f.body(next,true),8)).toThrow('DEPENDENCY_CONFLICT');
});
it('uses exact optimistic revision and immutable header predicates on caller connection', async () => {
    const { record } = setup(), query = jest.fn().mockResolvedValueOnce([{}]).mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{ affectedRows: 0 }]);
    const repo = new Repository(), conn: any = { query };
    await repo.add(record,conn); expect(query.mock.calls[0][0]).toMatch(/^INSERT INTO/);
    expect(await repo.edit(record,'old',conn)).toBe(true); expect(await repo.edit(record,'stale',conn)).toBe(false);
    expect(query.mock.calls[1][1]).toEqual([record.state,record.revision,record.snapshotJSON,op,'old',record.projectOurId,record.sourceMilestoneId,record.destinationMilestoneId,8]);
    query.mockResolvedValueOnce([[record]]); expect(await repo.find(op,conn)).toEqual(record);
    expect(query.mock.calls[3][0]).toContain('FOR UPDATE');
});
