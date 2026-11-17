jest.mock('../../../../tools/ToolsDb', () => ({ __esModule: true, default: { pool: { getConnection: jest.fn() } } }));
import ToolsDb from '../../../../tools/ToolsDb';
import Apply from '../ConsolidationApplyController';
import PreviewController from '../ConsolidationPreviewController';
import Preview from '../ConsolidationPreview';
import Reader from '../ConsolidationEffectsRepository';
import Operation from '../ConsolidationOperation';
import { operationFixture } from './operationFixture';
import Router from '../ConsolidationPreviewRouters';
import Status from '../ConsolidationStatusController';

const timestamp = '2026-09-29 12:00:00';
const oldTimestamp = '2020-01-01 00:00:00';
const user: any = { enviId: 7, systemRoleId: 1 };
const a = 1900000001, b = 1900000002, c = 1900000003, d = 1900000004;
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v));
let stored: any, staged: any, queries: string[], fail: string | undefined, corrupt: boolean, lostCommit: boolean;
let conn: any;
let fixture: ReturnType<typeof operationFixture>;
let initial: any;
function snapshot() { return { ...copy(fixture.snapshot), rows: copy(staged.rows) }; }
function makePreview(operationId?: string) {
    const p = Preview.create({ sourceMilestoneId: a, destinationMilestoneId: b,
        mappings: [{ sourceCaseId: a, target: { mode: 'existing', caseId: b } },
            { sourceCaseId: c, target: { mode: 'existing', caseId: d } }], ...(operationId ? { operationId } : {}) },
    snapshot(), { actorId: 7, projectOurId: fixture.snapshot.projectOurId, participantContractIds: [a,b] });
    staged.previews[p.previewId] = Preview.serialize(p); stored = copy(staged); return p;
}
const request = (p: any, keys?: string[], requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') => ({ requestId,
    previewId: p.previewId, expectedRevision: p.revision,
    unitIds: p.units.filter((u: any) => !keys || keys.includes(u.unitKey)).map((u: any) => u.unitId) });

beforeEach(() => {
    fixture = operationFixture(); queries = []; fail = undefined; corrupt = false; lostCommit = false;
    const rows = fixture.snapshot.rows;
    for (const table of ['Tasks_Watchers','Letters_Cases','ProcessesStepsInstances','Risks','Securities','MeetingArrangements',
        'Meetings','ContractMeetingNotes','Letters','LetterEvents','Letters_Entities','MilestoneDates','CaseTypeFolders','MilestoneSharingState']) rows[table] ||= [];
    rows.Cases.push({ ...rows.Cases[0], Id: c, GdFolderId: 'mock:case2' }, { ...rows.Cases[1], Id: d, GdFolderId: 'mock:target2' });
    rows.Cases[0].Description = 'źródło'.repeat(12000); rows.Cases[1].Description = 'cel';
    rows.Tasks = [{ Id: 31, CaseId: a, OwnerId: 7, HoursMon: '5.25', HoursTue: null, HoursWed: '0.00', HoursThu: '1.20', HoursFri: '0.50' },
        { Id: 32, CaseId: c, OwnerId: 7, HoursMon: '2.00' }];
    rows.Tasks_Watchers = [{ TaskId: 31, PersonId: 9 }];
    rows.ProcessInstances = [{ Id: 41, CaseId: a, TaskId: 31 }];
    rows.ProcessesStepsInstances = [{ Id: 42, ProcessInstanceId: 41, OurLetterId: 51 }];
    rows.Letters = [{ Id: 51, ProjectId: a }, { Id: 52, ProjectId: a }];
    rows.Letters_Cases = [{ LetterId: 51, CaseId: a, EditorId: 7 }, { LetterId: 51, CaseId: b, EditorId: 8 }, { LetterId: 52, CaseId: a, EditorId: 9 }];
    rows.LetterEvents = [{ Id: 53, LetterId: 51, RecipientsJSON: '[{"name":"synthetic"}]' }];
    rows.Risks = [{ Id: 61, CaseId: a, ProjectOurId: fixture.snapshot.projectOurId }];
    rows.Securities = [{ Id: 71, CaseId: a, ContractId: a, Value: '250.00' }];
    rows.Meetings = [{ Id: 81, ContractId: a }]; rows.MeetingArrangements = [{ Id: 82, MeetingId: 81, CaseId: a }];
    rows.ContractMeetingNotes = [{ Id: 83, MeetingId: 81, ContractId: a, Description: 'protokół' }];
    rows.MilestoneDates = [{ Id: 91, MilestoneId: a, Description: 'termin źródła' }];
    for (const table of ['Tasks', 'ProcessInstances', 'Risks', 'Securities', 'MeetingArrangements', 'Letters_Cases'])
        for (const row of rows[table]) row.LastUpdated = oldTimestamp;
    staged = { rows: copy(rows), operations: {}, previews: {}, receipts: {}, notes: [], audits: [] }; stored = copy(staged);
    conn = {
        beginTransaction: jest.fn(async () => { staged = copy(stored); }),
        commit: jest.fn(async () => { stored = copy(staged); if (lostCommit) { lostCommit = false; throw new Error('lost ACK'); } }),
        rollback: jest.fn(async () => { staged = copy(stored); }), release: jest.fn(), destroy: jest.fn(),
        query: jest.fn(async (input: any, values: any[] = []) => {
            const sql = (typeof input === 'string' ? input : input.sql).replace(/\s+/g, ' ').trim(); queries.push(sql);
            if (fail && sql.startsWith(fail)) throw new Error('synthetic failure');
            if(sql.includes('FROM PersonAccounts'))return [[{PersonId:values[0],SystemRoleId:1,SystemEmail:'synthetic@example.invalid',IsActive:1}]];
            if (sql.startsWith('SELECT DATE_FORMAT(CURRENT_TIMESTAMP')) return [[{stamp:timestamp}]];
            if (sql.includes('GET_LOCK')) return [[{ ok: 1 }]];
            if (sql.startsWith('SELECT LOWER(TABLE_NAME)')) return [values[0].map((name: string) => ({name,engine:'InnoDB'}))];
            if (sql.startsWith('SELECT TRIGGER_NAME')) return [[]];
            if (/^(SET TRANSACTION|START TRANSACTION|SELECT RELEASE_LOCK)/.test(sql)) return [[]];
            if (sql.startsWith('SELECT Id FROM ')) return [[{ Id: values[0] }]];
            if (sql.startsWith('SELECT PreviewId,')) {
                const p = staged.previews[values[0]] && Preview.restore(staged.previews[values[0]]);
                return [p ? [{ PreviewId: p.previewId, ActorId: 7, ProjectOurId: fixture.snapshot.projectOurId,
                    SourceMilestoneId: a, DestinationMilestoneId: b, Revision: p.revision }] : []];
            }
            if (sql.startsWith('SELECT SnapshotJSON FROM MilestoneConsolidationPreviews')) return [[{ SnapshotJSON: staged.previews[values[0]] }]];
            if (sql.startsWith('SELECT Id, ContractId FROM Milestones')) return [staged.rows.Milestones.filter((r: any) => values[0].includes(r.Id))];
            if (sql.startsWith('SELECT MilestoneId, ContractId FROM MilestoneContractLinks')) return [staged.rows.MilestoneContractLinks];
            if (sql.startsWith('SELECT Id, ProjectOurId FROM Contracts')) return [staged.rows.Contracts.filter((r: any) => values[0].includes(r.Id))];
            if (sql.startsWith('SELECT OperationId FROM MilestoneConsolidationOperations')) return [Object.values(staged.operations).map((r: any) => ({ OperationId: r.operationId }))];
            if (sql.startsWith('SELECT OperationId AS')) return [staged.operations[values[0]] ? [staged.operations[values[0]]] : []];
            if (sql.startsWith('SELECT OperationId, SourceEntity')) return [staged.notes.filter((n: any[]) => n[0] === values[0]).map((n: any[]) => ({
                OperationId:n[0], SourceEntity:n[1], SourceId:n[2], NoteKind:n[3], DestinationEntity:n[4], DestinationId:n[5],
                SourceContractId:n[6], ActorId:n[7], Body:n[8], SnapshotJSON:n[9], CreatedAt:timestamp }))];
            if (sql.startsWith('SELECT Payload, Result')) return [staged.receipts[values.slice(0,3).join('|')] ? [staged.receipts[values.slice(0,3).join('|')]] : []];
            if (sql.startsWith('INSERT INTO MilestoneConsolidationOperations')) {
                const [operationId,projectOurId,sourceMilestoneId,destinationMilestoneId,actorId,state,revision,snapshotJSON] = values;
                staged.operations[operationId] = {operationId,projectOurId,sourceMilestoneId,destinationMilestoneId,actorId,state,revision,snapshotJSON}; return [{ affectedRows: 1 }];
            }
            if (sql.startsWith('UPDATE MilestoneConsolidationOperations')) {
                const [state,revision,snapshotJSON,id,expected] = values;
                if (staged.operations[id]?.revision !== expected) return [{ affectedRows: 0 }];
                Object.assign(staged.operations[id],{state,revision,snapshotJSON}); return [{ affectedRows: 1 }];
            }
            const move = sql.match(/^UPDATE (Tasks|ProcessInstances|Risks|Securities|MeetingArrangements) SET CaseId/);
            if (move) {
                const row = staged.rows[move[1]].find((r: any) => r.Id === values[2] && r.CaseId === values[3]);
                if (row) Object.assign(row,{CaseId:values[0],LastUpdated:values[1]}); if (corrupt && row && move[1] === 'Tasks') row.HoursMon = '999.00';
                return [{ affectedRows: row ? 1 : 0 }];
            }
            if (sql.startsWith('DELETE FROM Letters_Cases')) {
                const rows = staged.rows.Letters_Cases; const i = rows.findIndex((r: any) => r.LetterId === values[0] && r.CaseId === values[1]);
                if (i >= 0) rows.splice(i,1); return [{ affectedRows: i >= 0 ? 1 : 0 }];
            }
            if (sql.startsWith('UPDATE Letters_Cases SET CaseId')) {
                const row = staged.rows.Letters_Cases.find((r: any) => r.LetterId === values[2] && r.CaseId === values[3]);
                if (row) Object.assign(row,{CaseId:values[0],LastUpdated:values[1]}); return [{ affectedRows: row ? 1 : 0 }];
            }
            if (sql.startsWith('INSERT INTO MilestoneConsolidationNotes')) { staged.notes.push(copy(values)); return [{}]; }
            if (sql.startsWith('INSERT INTO MilestoneConsolidationBatches')) { staged.audits.push(copy(values)); return [{}]; }
            if (sql.startsWith('INSERT INTO MilestoneContractLinks')) {
                if (!staged.rows.MilestoneContractLinks.some((r: any) => r.MilestoneId === values[0] && r.ContractId === values[1]))
                    staged.rows.MilestoneContractLinks.push({ MilestoneId: values[0], ContractId: values[1], ShortcutStatus: 'PENDING', ShortcutId: null, OperationId: null }); return [{}];
            }
            if (sql.startsWith('INSERT INTO MilestoneSharingRequests')) { staged.receipts[values.slice(0,3).join('|')] = { Payload: values[3], Result: values[4] }; return [{}]; }
            if (sql.startsWith('INSERT INTO MilestoneConsolidationPreviews')) { staged.previews[values[0]] = values[6]; return [{}]; }
            throw new Error('Unhandled synthetic SQL: '+sql);
        }),
    };
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    jest.spyOn(Reader.prototype, 'readEffects').mockImplementation(async (_project, _ids, _names, connection) => {
        expect(connection).toBe(conn); return snapshot();
    });
    initial = makePreview();
});

it('commits the whole dependency batch, full notes, one link, audit and receipt; replay has no effects', async () => {
    const before = copy(stored); const body = request(initial);
    expect(initial.content.analysis.conflicts).toEqual([]);
    const result = await Apply.addFromDto(body,user);
    expect(result.counts).toEqual({moved:3,pending:0}); expect(result.documentsReady).toBe(false);
    expect(stored.rows.Tasks.map((r: any) => r.CaseId)).toEqual([b,d]);
    expect(stored.rows.Tasks[0].HoursMon).toBe('5.25'); expect(stored.rows.Securities[0].ContractId).toBe(a);
    expect(stored.rows.Cases).toEqual(before.rows.Cases); expect(stored.rows.ContractMeetingNotes).toEqual(before.rows.ContractMeetingNotes);
    expect(stored.rows.Letters_Cases).toEqual([{LetterId:51,CaseId:b,EditorId:8,LastUpdated:oldTimestamp},{LetterId:52,CaseId:b,EditorId:9,LastUpdated:timestamp}]);
    expect(stored.notes).toHaveLength(4); expect(stored.notes.some((n: any) => n[8]?.length > 50000)).toBe(true);
    expect(stored.audits).toHaveLength(1); expect(stored.rows.MilestoneContractLinks).toHaveLength(1);
    const committed = copy(stored); expect(await Apply.addFromDto(body,user)).toEqual(result); expect(stored).toEqual(committed);
    expect(queries).toContain('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
});

it.each(['INSERT INTO MilestoneConsolidationOperations','UPDATE Tasks','UPDATE ProcessInstances','UPDATE Risks','UPDATE Securities',
    'UPDATE MeetingArrangements','DELETE FROM Letters_Cases','UPDATE Letters_Cases','INSERT INTO MilestoneConsolidationNotes',
    'INSERT INTO MilestoneContractLinks','INSERT INTO MilestoneConsolidationBatches','INSERT INTO MilestoneSharingRequests'])(
    'rolls back every effect after failure at %s; retry succeeds', async step => {
        const before = copy(stored); fail = step;
        await expect(Apply.addFromDto(request(initial),user)).rejects.toMatchObject({code:'RETRYABLE_STORAGE_ERROR'});
        expect(stored).toEqual(before); fail = undefined;
        await Apply.addFromDto(request(initial),user); expect(stored.audits).toHaveLength(1);
    });
it('recovers an uncertain commit from durable receipt without applying a second time', async () => {
    lostCommit = true;
    await expect(Apply.addFromDto(request(initial),user)).rejects.toMatchObject({code:'RETRYABLE_STORAGE_ERROR'});
    expect(stored.audits).toHaveLength(1); const before = copy(stored);
    await Apply.addFromDto(request(initial),user); expect(stored).toEqual(before);
});
it('detects unplanned changes to hours and rolls the complete batch back', async () => {
    const before = copy(stored); corrupt = true;
    await expect(Apply.addFromDto(request(initial),user)).rejects.toMatchObject({code:'DEPENDENCY_CONFLICT'});
    expect(stored).toEqual(before);
});
it('rejects stale content, reused request payload, moved selection and an unbound second operation', async () => {
    stored.rows.Tasks[0].HoursMon = '6.00';
    await expect(Apply.addFromDto(request(initial),user)).rejects.toMatchObject({code:'STALE_REVISION'});
    stored.rows.Tasks[0].HoursMon = '5.25';
    const first = request(initial,[`cases:${a}`]); const result = await Apply.addFromDto(first,user);
    await expect(Apply.addFromDto(request(initial),user)).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
    const unbound = makePreview();
    await expect(Apply.addFromDto(request(unbound,undefined,'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),user)).rejects.toMatchObject({code:'OPERATION_IN_PROGRESS'});
    const resumed = makePreview(result.operationId);
    await expect(Apply.addFromDto(request(resumed,[`cases:${a}`], 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),user))
        .rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
});
it('resumes remaining groups with a fresh persisted preview and preserves the operation', async () => {
    const first = await Apply.addFromDto(request(initial,[`cases:${a}`]),user);
    const p = await PreviewController.addFromDto({sourceMilestoneId:a,destinationMilestoneId:b,operationId:first.operationId,
        mappings:[{sourceCaseId:c,target:{mode:'existing',caseId:d}}]},user);
    const saved = Preview.restore(stored.previews[p.previewId]);
    const result = await Apply.addFromDto(request(saved,[`cases:${c}`,`milestone:${a}`], 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),user);
    expect(result.operationId).toBe(first.operationId); expect(result.counts).toEqual({moved:3,pending:0});
    expect(stored.audits).toHaveLength(2); expect(stored.notes).toHaveLength(4);
    const state = Operation.restore(stored.operations[first.operationId]); expect(state.batches).toHaveLength(2);
});
it('checks role and current scope even for a committed receipt', async () => {
    await Apply.addFromDto(request(initial),user); const before = copy(stored);
    await expect(Apply.addFromDto(request(initial),{...user,systemRoleId:4})).rejects.toMatchObject({code:'ROLE_DENIED'});
    await expect(Apply.addFromDto(request(initial),user,{projectOurIds:[]} as any)).rejects.toMatchObject({code:'OBJECT_NOT_FOUND'});
    expect(stored).toEqual(before);
});
it('serializes duplicate calls and commits one batch only', async () => {
    const results = await Promise.all([Apply.addFromDto(request(initial),user),Apply.addFromDto(request(initial),user)]);
    expect(results[0]).toEqual(results[1]); expect(stored.audits).toHaveLength(1);
});
it('keeps moved unit identities when transferred letter edges split the empty source group', async () => {
    staged.rows.Letters_Cases.push({LetterId:51,CaseId:c,EditorId:7});
    const p = makePreview(); expect(p.units).toHaveLength(2);
    const first = await Apply.addFromDto(request(p,[`cases:${a}`]),user);
    const next = makePreview(first.operationId); expect(next.units).toHaveLength(3);
    const result = await Apply.addFromDto(request(next,[`milestone:${a}`],'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),user);
    expect(result.counts).toEqual({moved:2,pending:0});
    expect(result.units.map(u => u.unitId)).toEqual(first.units.map(u => u.unitId));
    expect(stored.notes).toHaveLength(4);
});
it('refuses changed moved mappings and reappearing source dependencies before any new effect', async () => {
    const first = await Apply.addFromDto(request(initial,[`cases:${a}`]),user);
    await expect(PreviewController.addFromDto({sourceMilestoneId:a,destinationMilestoneId:b,operationId:first.operationId,
        mappings:[{sourceCaseId:a,target:{mode:'existing',caseId:d}}]},user)).rejects.toMatchObject({code:'INVALID_MAPPING'});
    staged = copy(stored); staged.rows.Tasks.push({Id:99,CaseId:a,HoursMon:'1.00'});
    const p = makePreview(first.operationId); const before = copy(stored);
    await expect(Apply.addFromDto(request(p,[`milestone:${a}`],'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),user))
        .rejects.toMatchObject({code:'DEPENDENCY_CONFLICT'});
    expect(stored).toEqual(before);
});
it.each(['engine','trigger','missing-table'])('refuses unsafe storage metadata: %s', async kind => {
    const original = conn.query.getMockImplementation();
    conn.query.mockImplementation(async (sql: any, values: any[]) => {
        const result = await original(sql,values);
        if (typeof sql === 'string' && sql.startsWith('SELECT LOWER(TABLE_NAME)')) {
            if (kind === 'engine') result[0][0].engine = 'MyISAM';
            if (kind === 'missing-table') result[0].pop();
        }
        if (typeof sql === 'string' && sql.startsWith('SELECT TRIGGER_NAME') && kind === 'trigger') result[0].push({TRIGGER_NAME:'unknown'});
        return result;
    });
    const before = copy(stored);
    await expect(Apply.addFromDto(request(initial),user)).rejects.toMatchObject({code:'UNHANDLED_REFERENCE'});
    expect(stored).toEqual(before);
});
it('rolls back a zero affected-row count and returns a sanitized conflict', async () => {
    const original = conn.query.getMockImplementation();
    conn.query.mockImplementation(async (sql: any, values: any[]) => {
        if (typeof sql === 'string' && sql.startsWith('UPDATE Risks')) return [{affectedRows:0}];
        return original(sql,values);
    });
    const before = copy(stored);
    await expect(Apply.addFromDto(request(initial),user)).rejects.toMatchObject({code:'DEPENDENCY_CONFLICT'});
    expect(stored).toEqual(before);
});
it('rechecks stored operation participants even when they are absent from the current preview', async () => {
    staged.rows.Contracts.push({Id:1900000005,ProjectOurId:fixture.snapshot.projectOurId,TypeId:1});
    const p = makePreview();
    const first = await Apply.addFromDto(request(p,[`cases:${a}`]),user);
    const record = stored.operations[first.operationId];
    const state = Operation.restore(record); state.participantContractIds.push(1900000005);
    // Valid persisted historic participant that was subsequently moved outside this project.
    const { createHash } = require('crypto'); const { canonical } = require('../ConsolidationPreview');
    record.snapshotJSON = canonical(state); record.revision = createHash('sha256').update(record.snapshotJSON).digest('hex');
    stored.rows.Contracts.find((r: any) => r.Id === 1900000005).ProjectOurId = 'FOREIGN';
    await expect(Apply.addFromDto(request(p,[`cases:${a}`]),user)).rejects.toMatchObject({code:'CROSS_PROJECT'});
    expect(stored.audits).toHaveLength(1);
});
it('exposes the apply handler with session/scope and no network transport', async () => {
    const route = Router.stack.find((layer: any) => layer.route?.path === '/milestone-consolidations/apply') as any;
    const send = jest.fn(), next = jest.fn();
    await route.route.stack[0].handle({body:request(initial),session:{userData:user},projectScope:{projectOurIds:[]}}, {send}, next);
    expect(send).not.toHaveBeenCalled(); expect(next).toHaveBeenCalledWith(expect.objectContaining({code:'OBJECT_NOT_FOUND'}));
    await route.route.stack[0].handle({body:request(initial),session:{userData:user}}, {send}, next);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({counts:{moved:3,pending:0}}));
});

it('records exact server timestamps only on updated rows and keeps both audit snapshots', async () => {
    await Apply.addFromDto(request(initial),user);
    for (const table of ['Tasks','ProcessInstances','Risks','Securities','MeetingArrangements'])
        expect(stored.rows[table].every((row: any) => row.LastUpdated === timestamp)).toBe(true);
    const audit = JSON.parse(stored.audits[0].find((v: any) => typeof v === 'string' && v.startsWith('{')));
    expect(audit.before.content.snapshot.rows.Tasks[0].LastUpdated).toBe(oldTimestamp);
    expect(audit.after.rows.Tasks[0].LastUpdated).toBe(timestamp);
});
it('does not hide unexpected timestamp changes to unchanged rows', async () => {
    const original = conn.query.getMockImplementation();
    conn.query.mockImplementation(async (sql: any, values: any[]) => {
        const result = await original(sql,values);
        if (typeof sql === 'string' && sql.startsWith('UPDATE Tasks')) staged.rows.Cases[0].LastUpdated = timestamp;
        return result;
    });
    const before = copy(stored);
    await expect(Apply.addFromDto(request(initial),user)).rejects.toMatchObject({code:'DEPENDENCY_CONFLICT'});
    expect(stored).toEqual(before);
});
it.each(['cases','contractmeetingnotes','milestoneconsolidationpreviews','letters','projects'])(
    'rejects a nontransactional read dependency %s before writing', async table => {
    const original = conn.query.getMockImplementation();
    conn.query.mockImplementation(async (sql: any, values: any[]) => {
        const result = await original(sql,values);
        if (typeof sql === 'string' && sql.startsWith('SELECT LOWER(TABLE_NAME)')) {
            expect(values[0]).toContain(table);
            result[0].find((row: any) => row.name === table).engine = 'MyISAM';
        }
        return result;
    });
    const before = copy(stored);
    await expect(Apply.addFromDto(request(initial),user)).rejects.toMatchObject({code:'UNHANDLED_REFERENCE'});
    expect(stored).toEqual(before);
    expect(queries.some(sql => /^(INSERT|UPDATE|DELETE) /.test(sql))).toBe(false);
});

it('reads partial progress, rolls back a later batch, then completes through the public preview selection', async () => {
    const firstBody = request(initial,[`cases:${a}`]);
    const first = await Apply.addFromDto(firstBody,user);
    const partial = await Status.get(first.operationId,user);
    expect(partial.counts).toEqual({moved:1,pending:2});
    const p = await PreviewController.addFromDto({sourceMilestoneId:a,destinationMilestoneId:b,operationId:first.operationId,mappings:[{sourceCaseId:c,target:{mode:'existing',caseId:d}}]},user);
    expect(p.units.map(u=>u.unitKey).sort()).toEqual([`cases:${c}`,`milestone:${a}`].sort());
    expect(p.movedUnits[0].unitId).toBe(first.units.find(u=>u.moved)!.unitId);
    expect(p.progress).toEqual({operationId:first.operationId,moved:1,pending:2,blocked:0});
    const body = {requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',previewId:p.previewId,expectedRevision:p.revision,unitIds:p.units.map(u=>u.unitId)};
    const before = copy(stored); fail = 'INSERT INTO MilestoneConsolidationBatches';
    await expect(Apply.addFromDto(body,user)).rejects.toMatchObject({code:'RETRYABLE_STORAGE_ERROR'});
    expect(stored).toEqual(before); fail=undefined;
    expect((await Status.get(first.operationId,user)).counts).toEqual(partial.counts);
    const done = await Apply.addFromDto(body,user);
    const status = await Status.get(done.operationId,user);
    expect(status.counts).toEqual({moved:3,pending:0});
    expect(status.units.map(u=>u.unitId)).toEqual(first.units.map(u=>u.unitId));
    expect(status.state).toBe('TRANSFERRING'); expect(status.documentsReady).toBe(false);
    expect(status.allowedActions).toContain('FINALIZE');
    expect(status.documentsReady).toBe(false); // Capability never claims Drive readiness.
    const notes = await Status.getNotes(done.operationId,user);
    expect(notes.notes).toHaveLength(4);
    expect(notes.notes.find((n:any)=>n.SourceEntity==='Cases' && n.SourceId===a)!.Body).toBe('źródło'.repeat(12000));
    const committed = copy(stored);
    expect(await Apply.addFromDto(firstBody,user)).toEqual(first);
    expect((await Status.get(done.operationId,user)).counts).toEqual({moved:3,pending:0});
    expect(stored).toEqual(committed); // Old receipt is historical; status is current.
    const empty = await PreviewController.addFromDto({sourceMilestoneId:a,destinationMilestoneId:b,operationId:done.operationId,mappings:[]},user);
    expect(empty.units).toEqual([]); expect(empty.movedUnits).toHaveLength(3);
});
it('resume preview keeps the historical identity of a group split by transferred letter edges', async () => {
    staged.rows.Letters_Cases.push({LetterId:51,CaseId:c,EditorId:7});
    const p = makePreview(); const first = await Apply.addFromDto(request(p,[`cases:${a}`]),user);
    const resumed = await PreviewController.addFromDto({sourceMilestoneId:a,destinationMilestoneId:b,operationId:first.operationId,mappings:[]},user);
    expect(resumed.units.map(u=>u.unitKey)).toEqual([`milestone:${a}`]);
    expect(resumed.movedUnits.map(u=>u.unitId)).toEqual(first.units.filter(u=>u.moved).map(u=>u.unitId));
    expect(resumed.progress).toEqual({operationId:first.operationId,moved:1,pending:1,blocked:0});
    expect((await PreviewController.get(resumed.previewId,user)).movedUnits).toEqual(resumed.movedUnits);
});
it('resume preview refuses new dependencies on moved sources before saving a misleading preview', async () => {
    const first = await Apply.addFromDto(request(initial,[`cases:${a}`]),user);
    staged.rows.Tasks.push({Id:999,CaseId:a,HoursMon:'9.00'}); stored=copy(staged);
    const before=copy(stored);
    await expect(PreviewController.addFromDto({sourceMilestoneId:a,destinationMilestoneId:b,operationId:first.operationId,mappings:[]},user))
        .rejects.toMatchObject({code:'DEPENDENCY_CONFLICT'});
    expect(stored).toEqual(before);
});
it('keeps a blocked pending group separate from moved work and permits another complete group', async () => {
    const first=await Apply.addFromDto(request(initial,[`cases:${a}`]),user);
    const resumed=await PreviewController.addFromDto({sourceMilestoneId:a,destinationMilestoneId:b,operationId:first.operationId,mappings:[]},user);
    // A previously selected but still unmoved case is intentionally not guessed on resume.
    expect(resumed.units.find(u=>u.unitKey===`cases:${c}`)!.state).toBe('BLOCKED');
    expect(resumed.progress).toEqual({operationId:first.operationId,moved:1,pending:2,blocked:1});
    const metadata=resumed.units.find(u=>u.unitKey===`milestone:${a}`)!;
    const result=await Apply.addFromDto({requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',previewId:resumed.previewId,expectedRevision:resumed.revision,unitIds:[metadata.unitId]},user);
    expect(result.counts).toEqual({moved:2,pending:1}); expect(stored.rows.Tasks[1].CaseId).toBe(c);
});

it('moves signed-letter associations while preserving all letter, signature and pending-job records, including replay',async()=>{
    for(const table of ['DocumentSignatures','SigningJobs']){
        const edge={TABLE_NAME:table,COLUMN_NAME:'LetterId',REFERENCED_TABLE_NAME:'Letters',REFERENCED_COLUMN_NAME:'Id',ORDINAL_POSITION:1};
        fixture.snapshot.columns.push(edge);fixture.snapshot.foreignKeys.push(edge);
    }
    stored.rows.DocumentSignatures=[{Id:101,LetterId:51,SignedGdFileId:'mock:signed',JobId:201},{Id:102,LetterId:52,SignedGdFileId:'mock:second',JobId:null}];
    stored.rows.SigningJobs=[{Id:201,LetterId:51,Status:'done'},{Id:202,LetterId:52,Status:'prepared'}];
    staged=copy(stored);const p=makePreview();const before=copy(stored);expect(p.content.analysis.conflicts).toEqual([]);
    const body=request(p);const result=await Apply.addFromDto(body,user);
    for(const table of ['Letters','DocumentSignatures','SigningJobs'])expect(stored.rows[table]).toEqual(before.rows[table]);
    expect(stored.rows.Letters_Cases.map((e:any)=>[e.LetterId,e.CaseId])).toEqual([[51,b],[52,b]]);
    expect(queries.some(sql=>/^(UPDATE|DELETE FROM|INSERT INTO) (Letters|DocumentSignatures|SigningJobs)\b/.test(sql))).toBe(false);
    const committed=copy(stored);expect(await Apply.addFromDto(body,user)).toEqual(result);expect(stored).toEqual(committed);
});
