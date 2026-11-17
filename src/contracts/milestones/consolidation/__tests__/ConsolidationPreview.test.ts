import Preview, { canonical } from '../ConsolidationPreview';
import { createHash } from 'crypto';
import type Effects from '../ConsolidationEffects';

const schema = require('./effectsSchemaFixture.json');
const scope = () => ({ actorId: 7, projectOurId: 'P', participantContractIds: [10, 20] });
const request = () => ({ sourceMilestoneId: 1, destinationMilestoneId: 2, mappings: [] });
function fixture(): Parameters<typeof Effects.analyze>[1] {
    return { ...JSON.parse(JSON.stringify(schema)), projectOurId: 'P', boundaryReferences: 0,
        parentScopeExpression: 'ifnull(`ParentCaseId`,0)', nameWeights: [], folderReferences: [], folderReferenceScope: 'SELECTED_PROJECT_ONLY',
        rows: { Projects: [{ Id: 7, OurId: 'P' }], Contracts: [{ Id: 10, ProjectOurId: 'P', TypeId: 1 }, { Id: 20, ProjectOurId: 'P', TypeId: 1 }],
            Milestones: [{ Id: 1, ContractId: 10, TypeId: 5, Description: 'źródło' }, { Id: 2, ContractId: 20, TypeId: 5 }],
            Cases: [], Tasks: [], ProcessInstances: [], MilestoneContractLinks: [], CaseTypes: [], CaseType_SubCaseTypes: [],
            MilestoneTypes_ContractTypes: [{ MilestoneTypeId: 5, ContractTypeId: 1 }],
        } };
}

describe('preview snapshot identity (no persistence or permission claim)', () => {
    it('rejects a validly checksummed preview using the superseded time-segment policy', () => {
        const p = Preview.create(request(), fixture(), scope());
        p.content.analysis.classification.find(c => c.table === 'Tasks')!.policy = 'REPARENT_SAME_ID_WITH_TIME_SEGMENT';
        p.revision = createHash('sha256').update(canonical(p.content)).digest('hex');
        const { integrity, ...body } = p;
        p.integrity = createHash('sha256').update(canonical(body)).digest('hex');
        expect(() => Preview.restore(canonical(p))).toThrow('STALE_REVISION');
    });
    it('round trips full text with stable preview and unit UUIDs, never READY', () => {
        const s = fixture(); s.rows.Milestones[0].Description = 'ą'.repeat(140000);
        const p = Preview.create(request(), s, scope());
        const restored = Preview.restore(Preview.serialize(p));
        expect(restored).toEqual(p);
        expect(restored.content.snapshot.rows.Milestones.find(m => m.Id === 1)!.Description).toHaveLength(140000);
        expect(p.units).toHaveLength(1);
        expect(p.content.analysis.transferReady).toBe(false);
        expect(Preview.revalidate(Preview.serialize(p), p.revision, request(), s, scope()).units).toEqual(p.units);
    });
    it('ignores SQL row order and object key order but preserves content', () => {
        const a = fixture(), b = fixture();
        b.rows.Contracts.reverse(); b.rows.Milestones.reverse(); b.columns.reverse(); b.indexes.reverse(); b.foreignKeys.reverse();
        b.rows.Projects[0] = { OurId: 'P', Id: 7 };
        expect(Preview.material(request(), a, scope()).revision).toBe(Preview.material(request(), b, { ...scope(), participantContractIds: [20, 10] }).revision);
    });
    it('has a fresh identity for a separate preview, while content revision stays equal', () => {
        const a = Preview.create(request(), fixture(), scope()), b = Preview.create(request(), fixture(), scope());
        expect(a.previewId).not.toBe(b.previewId); expect(a.units[0].unitId).not.toBe(b.units[0].unitId);
        expect(a.revision).toBe(b.revision);
    });
    it.each(['text', 'hours', 'dictionary', 'metadata', 'alias', 'boundary', 'actor'])(
        'rejects changed %s even when all timestamps stay unchanged', kind => {
            const s = fixture(), sc = scope(), p = Preview.create(request(), s, sc);
            if (kind === 'text') s.rows.Milestones[0].Description = 'changed';
            if (kind === 'hours') s.rows.Tasks.push({ Id: 9, CaseId: 999, HoursMon: '9.25' });
            if (kind === 'dictionary') s.rows.CaseTypes.push({ Id: 99, IsUniquePerMilestone: 1 });
            if (kind === 'metadata') s.columns.push({ TABLE_NAME: 'new', COLUMN_NAME: 'CaseId' });
            if (kind === 'alias') s.folderReferences.push({ table: 'Cases', key: '9', milestoneId: 3, field: 'GdFolderId', folderId: 'mock:alias' });
            if (kind === 'boundary') s.boundaryReferences++;
            if (kind === 'actor') sc.actorId++;
            expect(() => Preview.revalidate(Preview.serialize(p), p.revision, request(), s, sc)).toThrow('STALE_REVISION');
        });
    it('rejects missing participant context and project mismatch', () => {
        expect(() => Preview.create(request(), fixture(), { ...scope(), participantContractIds: [10] })).toThrow('INVALID_SNAPSHOT');
        expect(() => Preview.create(request(), fixture(), { ...scope(), projectOurId: 'OTHER' })).toThrow('INVALID_SNAPSHOT');
    });
    it('requires linked participants too', () => {
        const s = fixture(); s.rows.MilestoneContractLinks.push({ MilestoneId: 2, ContractId: 30 });
        expect(() => Preview.create(request(), s, scope())).toThrow('INVALID_SNAPSHOT');
        expect(Preview.create(request(), s, { ...scope(), participantContractIds: [10, 20, 30] }).revision).toMatch(/^[a-f0-9]{64}$/);
    });
    it('invalidates a changed explicit mapping without changing the database snapshot', () => {
        const s = fixture();
        s.rows.CaseTypes = [{ Id: 50, MilestoneTypeId: 5, IsUniquePerMilestone: 0, IsSubCaseOnly: 0 }];
        s.rows.Cases = [{ Id: 100, MilestoneId: 1, TypeId: 50, ParentCaseId: null },
            { Id: 200, MilestoneId: 2, TypeId: 50, ParentCaseId: null },
            { Id: 201, MilestoneId: 2, TypeId: 50, ParentCaseId: null }];
        const a = { ...request(), mappings: [{ sourceCaseId: 100, target: { mode: 'existing', caseId: 200 } }] };
        const b = { ...request(), mappings: [{ sourceCaseId: 100, target: { mode: 'existing', caseId: 201 } }] };
        const p = Preview.create(a, s, scope());
        expect(() => Preview.revalidate(Preview.serialize(p), p.revision, b, s, scope())).toThrow('STALE_REVISION');
    });
    it('detects corrupt persisted content and mismatched expected revision', () => {
        const p = Preview.create(request(), fixture(), scope());
        const saved = Preview.serialize(p); p.content.snapshot.rows.Milestones[0].Description = 'tampered';
        expect(() => Preview.restore(JSON.stringify(p))).toThrow('SNAPSHOT_INTEGRITY_ERROR');
        expect(() => Preview.revalidate(saved, '0'.repeat(64), request(), fixture(), scope())).toThrow('STALE_REVISION');
        expect(() => Preview.restore('{')).toThrow('INVALID_SNAPSHOT');
    });
    it('keeps day-array order, raw JSON and duplicate rows significant', () => {
        expect(canonical([1, 2])).not.toBe(canonical([2, 1]));
        const a = fixture(), b = fixture();
        a.rows.Extra = [{ Value: '[1,2]' }]; b.rows.Extra = [{ Value: '[2,1]' }];
        expect(Preview.material(request(), a, scope()).revision).not.toBe(Preview.material(request(), b, scope()).revision);
        b.rows.Extra = [...a.rows.Extra, ...a.rows.Extra];
        expect(Preview.material(request(), a, scope()).revision).not.toBe(Preview.material(request(), b, scope()).revision);
    });
    it('does not mutate the source snapshot or scope', () => {
        const s = fixture(), sc = scope(), q = request(), before = JSON.stringify([s, sc, q]);
        Preview.create(q, s, sc); expect(JSON.stringify([s, sc, q])).toBe(before);
    });
    it.each([undefined, NaN, Infinity, -0, new Date(), BigInt(1), [, 1], { missing: undefined }])('refuses lossy JSON values %#', value => {
        expect(() => canonical(value)).toThrow('INVALID_SNAPSHOT');
    });
    it('refuses circular values', () => {
        const a: any = {}; a.self = a; expect(() => canonical(a)).toThrow('INVALID_SNAPSHOT');
    });
});
