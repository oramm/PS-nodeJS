import Note from '../ConsolidationNote';
import Repository from '../ConsolidationNoteRepository';
import Preview from '../ConsolidationPreview';
import type Effects from '../ConsolidationEffects';

const schema = require('./effectsSchemaFixture.json');
const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function fixture() {
    const snapshot: Parameters<typeof Effects.analyze>[1] = {
        ...JSON.parse(JSON.stringify(schema)), projectOurId: 'P', boundaryReferences: 0,
        parentScopeExpression: 'ifnull(`ParentCaseId`,0)', nameWeights: [], folderReferences: [], folderReferenceScope: 'SELECTED_PROJECT_ONLY',
        rows: { Projects: [{ Id: 1, OurId: 'P' }],
            Contracts: [{ Id: 10, ProjectOurId: 'P', TypeId: 1 }, { Id: 20, ProjectOurId: 'P', TypeId: 1 }],
            Milestones: [{ Id: 1, ContractId: 10, TypeId: 5, GdFolderId: 'mock:source', Description: 'milestone' },
                { Id: 2, ContractId: 20, TypeId: 5, GdFolderId: 'mock:target', Description: 'keep target' }],
            Cases: [{ Id: 100, MilestoneId: 1, TypeId: 50, ParentCaseId: null, GdFolderId: 'mock:case', Description: 'ą'.repeat(140000), Status: 'OLD' },
                { Id: 200, MilestoneId: 2, TypeId: 50, ParentCaseId: null, GdFolderId: 'mock:case-target', Description: 'keep case', Status: 'OPEN' }],
            MilestoneDates: [{ Id: 30, MilestoneId: 1, Description: 'date', EndDate: '2026-09-25' }],
            Tasks: [], ProcessInstances: [], MilestoneContractLinks: [], CaseType_SubCaseTypes: [],
            CaseTypes: [{ Id: 50, MilestoneTypeId: 5, IsUniquePerMilestone: 0, IsSubCaseOnly: 0 }],
            MilestoneTypes_ContractTypes: [{ MilestoneTypeId: 5, ContractTypeId: 1 }],
        },
    };
    const make = () => {
        const p = Preview.create({ sourceMilestoneId: 1, destinationMilestoneId: 2,
            mappings: [{ sourceCaseId: 100, target: { mode: 'existing', caseId: 200 } }] }, snapshot,
        { actorId: 7, projectOurId: 'P', participantContractIds: [10, 20] });
        return { p, input: { requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', previewId: p.previewId, expectedRevision: p.revision, unitIds: p.units.map(u => u.unitId) } };
    };
    return { snapshot, make };
}
it('preserves complete source text, original status/dates and provenance without overwriting destination', () => {
    const f = fixture(), before = JSON.stringify(f.snapshot), { p, input } = f.make();
    const notes = Note.create(Preview.serialize(p), input, operationId, 8);
    expect(notes).toHaveLength(3);
    const c = notes.find(n => n.sourceEntity === 'Cases')!;
    expect(c.body).toHaveLength(140000); expect(JSON.parse(c.snapshotJSON)).toMatchObject({ Id: 100, Status: 'OLD' });
    expect(c).toMatchObject({ operationId, sourceId: 100, sourceContractId: 10, actorId: 8, destinationEntity: 'Cases', destinationId: 200 });
    expect(notes.find(n => n.sourceEntity === 'MilestoneDates')).toMatchObject({ sourceId: 30, destinationEntity: 'Milestones', destinationId: 2 });
    expect(JSON.parse(notes.find(n => n.sourceEntity === 'MilestoneDates')!.snapshotJSON).EndDate).toBe('2026-09-25');
    expect(JSON.stringify(f.snapshot)).toBe(before);
});
it('materializes identical keys/content on retry and retains empty text distinctly from missing text', () => {
    const f = fixture(); f.snapshot.rows.Cases[0].Description = ''; delete f.snapshot.rows.Milestones[0].Description;
    const { p, input } = f.make(), serialized = Preview.serialize(p);
    const a = Note.create(serialized, input, operationId, 7), b = Note.create(serialized, input, operationId.toUpperCase(), 7);
    expect(a).toEqual(b); expect(a.find(n => n.sourceEntity === 'Cases')!.body).toBe('');
    expect(a.find(n => n.sourceEntity === 'Milestones')!.body).toBeNull();
    expect(JSON.parse(a.find(n => n.sourceEntity === 'Milestones')!.snapshotJSON)).not.toHaveProperty('Description');
});
it('creates notes only for selected groups', () => {
    const { p, input } = fixture().make(); input.unitIds = p.units.filter(u => u.unitKey.startsWith('cases:')).map(u => u.unitId);
    expect(Note.create(Preview.serialize(p), input, operationId, 7).map(n => n.sourceEntity)).toEqual(['Cases']);
});
it('rejects stale selection and blocked units instead of creating misleading notes', () => {
    const f = fixture(), first = f.make();
    expect(() => Note.create(Preview.serialize(first.p), { ...first.input, expectedRevision: '0'.repeat(64) }, operationId, 7)).toThrow('STALE_REVISION');
    f.snapshot.boundaryReferences = 1; const blocked = f.make();
    expect(() => Note.create(Preview.serialize(blocked.p), blocked.input, operationId, 7)).toThrow('DEPENDENCY_CONFLICT');
});
it.each([0, -1, 2147483648, '7', null])('rejects invalid author identity %#', actor => {
    const { p, input } = fixture().make(); expect(() => Note.create(Preview.serialize(p), input, operationId, actor)).toThrow('INVALID_SNAPSHOT');
});
it('rejects invalid operation identity and non-text descriptions', () => {
    const f = fixture(), { p, input } = f.make();
    expect(() => Note.create(Preview.serialize(p), input, 'bad', 7)).toThrow('INVALID_REQUEST');
    f.snapshot.rows.Cases[0].Description = 123; const bad = f.make();
    expect(() => Note.create(Preview.serialize(bad.p), bad.input, operationId, 7)).toThrow('INVALID_SNAPSHOT');
});
it('uses only the caller connection and inserts complete parameters, never overwrites evidence', async () => {
    const { p, input } = fixture().make(), notes = Note.create(Preview.serialize(p), input, operationId, 7);
    const conn: any = { query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    await new Repository().add(notes, conn); expect(conn.query).toHaveBeenCalledTimes(3);
    const call = conn.query.mock.calls.find((c: any[]) => c[1][1] === 'Cases');
    expect(call[0]).toMatch(/^INSERT INTO MilestoneConsolidationNotes/); expect(call[0]).not.toMatch(/UPDATE|REPLACE|IGNORE/);
    expect(call[1][8]).toHaveLength(140000); expect(JSON.parse(call[1][9]).Status).toBe('OLD');
    conn.query.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' }));
    await expect(new Repository().add(notes, conn)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
});
it('reads complete notes by parameterized destination and preserves timestamp strings', async () => {
    const row = { Body: 'ą'.repeat(140000), SnapshotJSON: '{"Status":"OLD"}', CreatedAt: '2026-09-25 12:00:00.123456' };
    const conn: any = { query: jest.fn().mockResolvedValue([[row]]) };
    expect(await new Repository().findAtDestination('Cases', 200, conn)).toEqual([row]);
    expect(conn.query).toHaveBeenCalledWith(expect.objectContaining({ dateStrings: true }), ['Cases', 200]);
});
