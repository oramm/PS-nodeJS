jest.mock('../../../../tools/ToolsDb', () => ({ __esModule: true, default: { pool: { getConnection: jest.fn() } } }));
jest.mock('../../../../controllers/BaseController', () => ({ __esModule: true, default: class {
    static withAuth(fn: any, auth: any) { return fn({}, auth); }
} }));
import ToolsDb from '../../../../tools/ToolsDb';
import Controller from '../ConsolidationPreparationController';
import Drive from '../ConsolidationPreparationDrive';
import Reader from '../ConsolidationEffectsRepository';
import Preview from '../ConsolidationPreview';
import Validator from '../ConsolidationPreparationValidator';
import Preparation from '../ConsolidationPreparation';
import Operation from '../ConsolidationOperation';
import { operationFixture } from './operationFixture';
import Router from '../ConsolidationPreviewRouters';

const a = 1900000001, b = 1900000002, child = 1900000003;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
let stored: any, staged: any, original: any, fixture: any, conn: any, body: any, user: any;
let files: Map<string, any>, inTransaction: boolean, sequence: number, events: string[];
let failSql: string | undefined, loseCommitAt: number, commitCount: number, driveFailure: string | undefined;
let afterDrive: (() => void) | undefined;
let commitApplied: boolean, mutations: number[];
const file = (id: string, parent: string, name: string, owner?: string) => ({ id, name, parents: [parent],
    mimeType: 'application/vnd.google-apps.folder', trashed: false, capabilities: { canAddChildren: true },
    appProperties: owner ? { psConsolidationPreparation: owner } : {} });
function snapshot() {
    const s = clone(fixture.snapshot); s.rows = clone(staged.rows);
    s.folderReferences = [];
    for (const table of ['Milestones', 'Cases', 'CaseTypeFolders']) for (const r of s.rows[table]) if (r.GdFolderId)
        s.folderReferences.push({ table, key: table === 'CaseTypeFolders' ? `${r.MilestoneId}:${r.CaseTypeId}` : String(r.Id),
            milestoneId: table === 'Milestones' ? r.Id : r.MilestoneId, field: 'GdFolderId', folderId: r.GdFolderId });
    return s;
}
function preview(mappings?: any[], operationId?:string) {
    const p = Preview.create({ sourceMilestoneId: a, destinationMilestoneId: b, ...(operationId?{operationId}:{}), mappings: mappings || [
        { sourceCaseId: a, target: { mode: 'create', caseTypeId: 50, name: 'Nowy', parentSourceCaseId: null } },
        { sourceCaseId: child, target: { mode: 'create', caseTypeId: 50, name: 'Dziecko', parentSourceCaseId: a } },
    ] }, snapshot(), { actorId: 7, projectOurId: fixture.snapshot.projectOurId, participantContractIds: [a, b] });
    staged.previews[p.previewId] = Preview.serialize(p); stored = clone(staged);
    body = { requestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', previewId: p.previewId, expectedRevision: p.revision };
    return p;
}
const run = (input = body, actor = user, scope?: any) => Controller.addFromDto(input, actor, scope, {} as any);
const journal = () => Object.values(stored.preparations)[0] as any;
function setup() {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    fixture = operationFixture(); user = { enviId: 7, systemRoleId: 1 }; sequence = 100;
    files = new Map(); events = []; inTransaction = false; failSql = undefined; loseCommitAt = 0; commitCount = 0;
    driveFailure = undefined; afterDrive = undefined;
    commitApplied = true; mutations = [];
    const rows = fixture.snapshot.rows;
    for (const name of ['Tasks_Watchers','Letters_Cases','ProcessesStepsInstances','Risks','Securities','MeetingArrangements',
        'Meetings','ContractMeetingNotes','Letters','LetterEvents','Letters_Entities','MilestoneDates','CaseTypeFolders','MilestoneSharingState']) rows[name] ||= [];
    rows.Cases = [{ Id: a, TypeId: 50, MilestoneId: a, ParentCaseId: null, Number: 1, Name: 'Old', GdFolderId: 'mock:source-case' },
        { Id: child, TypeId: 50, MilestoneId: a, ParentCaseId: a, Number: 2, SubCaseNumber: 1, Name: 'Old child', GdFolderId: 'mock:source-child' }];
    rows.CaseTypes[0].Name = 'Sprawy'; rows.CaseTypes[0].FolderNumber = '01';
    rows.CaseType_SubCaseTypes = [{ ParentCaseTypeId: 50, SubCaseTypeId: 50 }];
    fixture.snapshot.nameWeights = ['Old', 'Old child', 'Nowy', 'Dziecko'].map(name => ({ name, weight: name.toLowerCase() }));
    rows.Tasks = [{ Id: 9, CaseId: a, HoursMon: '3.25' }];
    staged = { rows: clone(rows), preparations: {}, claims: [], previews: {} }; stored = clone(staged);
    for (const m of rows.Milestones) files.set(m.GdFolderId, file(m.GdFolderId, 'contract', 'root'));
    conn = {
        beginTransaction: jest.fn(async () => { expect(inTransaction).toBe(false); inTransaction = true; staged = clone(stored); }),
        commit: jest.fn(async () => { commitCount++;
            if (JSON.stringify(staged) !== JSON.stringify(stored)) mutations.push(commitCount);
            if (loseCommitAt === commitCount && !commitApplied) throw new Error('commit not applied');
            stored = clone(staged); inTransaction = false;
            if (loseCommitAt === commitCount) throw new Error('lost commit response'); }),
        rollback: jest.fn(async () => { staged = clone(stored); inTransaction = false; }),
        release: jest.fn(), destroy: jest.fn(),
        query: jest.fn(async (input: any, values: any[] = []) => {
            const sql = (typeof input === 'string' ? input : input.sql).replace(/\s+/g, ' ').trim(); events.push(sql);
            if (failSql && sql.startsWith(failSql)) { failSql = undefined; throw new Error('injected DB failure'); }
            if (sql.includes('GET_LOCK')) return [[{ ok: 1 }]];
            if (/^(SET TRANSACTION|SELECT RELEASE_LOCK)/.test(sql)) return [[]];
            if (sql.startsWith('SELECT LOWER(TABLE_NAME)')) return [values[0].map((name: string) => ({ name, engine: 'InnoDB' }))];
            if (sql.startsWith('SELECT TRIGGER_NAME')) return [[]];
            if (sql.startsWith('SELECT TABLE_NAME, COLUMN_NAME')) return [['Projects','Contracts','Milestones','Cases','Letters','CaseTypeFolders']
                .map(TABLE_NAME => ({ TABLE_NAME, COLUMN_NAME: 'GdFolderId' }))];
            if (sql.includes(' AS objectKey FROM ')) {
                const table = sql.match(/FROM (\w+)/)![1];
                return [staged.rows[table].filter((r: any) => r.GdFolderId === values[0]).map((r: any) => ({ objectKey:
                    table === 'CaseTypeFolders' ? `${r.MilestoneId}:${r.CaseTypeId}` : String(r.Id) }))];
            }
            if (sql.startsWith('SELECT StateJSON')) return [[...Object.values(staged.preparations)].filter((s: any) => s.actorId === values[0] && s.requestId === values[1]).map(s => ({ StateJSON: JSON.stringify(s) }))];
            if (sql.startsWith('INSERT INTO MilestoneConsolidationPreparations')) { staged.preparations[values[0]] = JSON.parse(values[3]); return [{ affectedRows: 1 }]; }
            if (sql.startsWith('UPDATE MilestoneConsolidationPreparations')) { staged.preparations[values[1]] = JSON.parse(values[0]); return [{ affectedRows: 1 }]; }
            if (sql.startsWith('SELECT SourceObjectId')) return [staged.claims.filter((c: any) => values[0].includes(c.SourceObjectId))];
            if (sql.startsWith('INSERT INTO MilestoneConsolidationTargetClaims')) { if (staged.claims.some((c: any) => c.SourceObjectId === values[0])) throw new Error('duplicate claim');
                staged.claims.push({ SourceObjectId: values[0], PreparationId: values[1] }); return [{ affectedRows: 1 }]; }
            if (sql.startsWith('SELECT PreviewId,')) { const text = staged.previews[values[0]], p = text && Preview.restore(text);
                return [p ? [{ PreviewId: p.previewId, ActorId: 7, ProjectOurId: fixture.snapshot.projectOurId, SourceMilestoneId: a, DestinationMilestoneId: b, Revision: p.revision }] : []]; }
            if (sql.startsWith('SELECT SnapshotJSON FROM MilestoneConsolidationPreviews')) return [[{ SnapshotJSON: staged.previews[values[0]] }]];
            if (sql.startsWith('INSERT INTO MilestoneConsolidationPreviews')) { staged.previews[values[0]] = values[6]; return [{ affectedRows: 1 }]; }
            if (sql.startsWith('SELECT Id, ContractId FROM Milestones')) return [staged.rows.Milestones.filter((r: any) => values[0].includes(r.Id))];
            if (sql.startsWith('SELECT MilestoneId, ContractId')) return [staged.rows.MilestoneContractLinks];
            if (sql.startsWith('SELECT Id, ProjectOurId FROM Contracts')) return [staged.rows.Contracts.filter((r: any) => values[0].includes(r.Id))];
            if (sql.startsWith('SELECT OperationId AS')) return [(staged.operations || []).filter((r:any)=>r.operationId===values[0])];
            if (sql.startsWith('SELECT OperationId')) return [(staged.operations || []).map((r:any)=>({OperationId:r.operationId??r.OperationId}))];
            if (sql.startsWith('INSERT INTO Cases')) {
                const id = ++sequence;
                const number = Math.max(0, ...staged.rows.Cases.filter((r: any) => r.MilestoneId === values[0] && r.TypeId === values[1]).map((r: any) => r.Number || 0)) + 1;
                const unique = Number(staged.rows.CaseTypes.find((r: any) => r.Id === values[1]).IsUniquePerMilestone);
                staged.rows.Cases.push({ Id: id, MilestoneId: values[0], TypeId: values[1], ParentCaseId: values[2], Name: values[3],
                    Number: unique ? null : number, SubCaseNumber: values[5], GdFolderId: '', Status: 'Na zaś' });
                return [{ insertId: id, affectedRows: 1 }];
            }
            if (sql.startsWith('SELECT * FROM Cases')) return [staged.rows.Cases.filter((r: any) => r.Id === values[0])];
            if (sql.startsWith('UPDATE Cases SET GdFolderId')) { const c = staged.rows.Cases.find((r: any) => r.Id === values[1] && r.GdFolderId === '');
                if (c) c.GdFolderId = values[0]; return [{ affectedRows: c ? 1 : 0 }]; }
            if (sql.startsWith('INSERT INTO CaseTypeFolders')) { staged.rows.CaseTypeFolders.push({ MilestoneId: values[0], CaseTypeId: values[1], GdFolderId: values[2] }); return [{ affectedRows: 1 }]; }
            if (sql.startsWith('SELECT * FROM CaseTypeFolders')) return [staged.rows.CaseTypeFolders.filter((r: any) => r.MilestoneId === values[0] && r.CaseTypeId === values[1])];
            throw new Error('Unhandled synthetic SQL: ' + sql);
        }),
    };
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    jest.spyOn(Reader.prototype, 'readEffects').mockImplementation(async () => snapshot());
    jest.spyOn(Drive, 'reserve').mockImplementation(async () => { expect(inTransaction).toBe(false); expect(journal()).toBeDefined();
        if (driveFailure === 'reserve') { driveFailure = undefined; throw new Error('reserve failure'); } return 'mock:new-' + (++sequence); });
    jest.spyOn(Drive, 'get').mockImplementation(async (_auth, id) => { expect(inTransaction).toBe(false);
        if (driveFailure === 'get') { driveFailure = undefined; throw { response: { status: 403 } }; }
        if (!files.has(id)) throw { response: { status: 404 } }; return clone(files.get(id)); });
    jest.spyOn(Drive, 'create').mockImplementation(async (_auth, id, parent, name, owner) => {
        expect(inTransaction).toBe(false); expect(journal().folders.find((f: any) => f.id === id)?.attempted).toBe(true);
        if (driveFailure === 'before-create') { driveFailure = undefined; throw new Error('before create'); }
        if (files.has(id)) throw { response: { status: 409 } };
        files.set(id, file(id, parent, name, owner)); afterDrive?.();
        if (driveFailure === 'after-create') { driveFailure = undefined; throw new Error('lost create response'); }
    });
    preview(); original = clone(stored.rows);
}
beforeEach(setup);

it('prepares parent then child, retains tasks/hours, returns a fresh existing preview, and replays without duplication', async () => {
    const result = await run();
    expect(result).toMatchObject({ state: 'PREPARED', transferPerformed: false, folderRollbackOnTransferFailure: false });
    expect(result.previewId).not.toBe(body.previewId);
    expect(result.mappings.every(m => m.target.mode === 'existing')).toBe(true);
    expect(stored.rows.Tasks).toEqual(original.Tasks);
    expect(stored.rows.Cases).toHaveLength(4); expect(files.size).toBe(5);
    const targets = stored.rows.Cases.filter((c: any) => c.MilestoneId === b);
    expect(targets[1].ParentCaseId).toBe(targets[0].Id);
    expect(files.get(targets[1].GdFolderId).parents).toEqual([targets[0].GdFolderId]);
    expect(files.get(targets[1].GdFolderId).name).toBe('S01.01 Dziecko');
    const again = await run(); expect(again.preparationId).toBe(result.preparationId);
    expect(stored.rows.Cases).toHaveLength(4); expect(Drive.create).toHaveBeenCalledTimes(3);
});
it.each(['reserve','before-create','after-create','get'])('resumes durable state after %s without duplicate cases/folders', async failure => {
    driveFailure = failure; await expect(run()).rejects.toBeDefined();
    const id = journal().id, previousIds = stored.rows.Cases.map((c: any) => c.Id);
    // A new invocation reconstructs its entire workflow state from persisted JSON.
    await expect(run()).resolves.toMatchObject({ preparationId: id, state: 'PREPARED' });
    expect(previousIds.every((id: number) => stored.rows.Cases.some((c: any) => c.Id === id))).toBe(true);
    expect(stored.rows.Cases).toHaveLength(4); expect(files.size).toBe(5);
});
it('refuses a parent move after child creation and resumes with the same IDs', async () => {
    const destination = fixture.snapshot.rows.Milestones.find((m: any) => m.Id === b).GdFolderId;
    const originalParent = [...files.get(destination).parents];
    afterDrive = () => {
        files.get(destination).parents = ['moved-outside-test'];
        afterDrive = undefined;
    };
    await expect(run()).rejects.toMatchObject({ code: 'DRIVE_STATE_UNCERTAIN' });
    const createdIds = [...files.keys()].filter(id => id.startsWith('mock:new-'));
    expect(createdIds).toHaveLength(1);
    expect(journal().folders.find((f: any) => f.id === createdIds[0])?.ready).toBe(false);
    files.get(destination).parents = originalParent;
    await expect(run()).resolves.toMatchObject({ state: 'PREPARED' });
    expect([...files.keys()].filter(id => id.startsWith('mock:new-'))).toContain(createdIds[0]);
    expect(stored.rows.Cases).toHaveLength(4);
    expect(files.size).toBe(5);
});
it.each(['INSERT INTO Cases','UPDATE Cases SET GdFolderId','INSERT INTO CaseTypeFolders','INSERT INTO MilestoneConsolidationPreviews'])('rolls back only current DB step at %s and resumes', async sql => {
    failSql = sql; await expect(run()).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR' });
    const remoteBefore = [...files.keys()]; await run();
    expect(remoteBefore.every(id => files.has(id))).toBe(true); expect(stored.rows.Cases).toHaveLength(4);
});
it('recovers both commit outcomes at EVERY mutating durable boundary, including final preview', async () => {
    await run(); const boundaries = [...mutations]; expect(boundaries.length).toBeGreaterThan(10);
    for (const applied of [false,true]) for (const index of boundaries) {
        jest.restoreAllMocks(); setup(); commitApplied = applied; loseCommitAt = index;
        await expect(run()).rejects.toBeDefined(); loseCommitAt = 0;
        await run(); expect(stored.rows.Cases).toHaveLength(4); expect(files.size).toBe(5);
    }
    process.stdout.write(`Synthetic commit outcomes verified: ${boundaries.length * 2}; boundaries: ${boundaries.join(',')}\n`);
}, 300000);
it('serializes concurrent requests with the same key', async () => {
    const [x,y] = await Promise.all([run(),run()]); expect(x.preparationId).toBe(y.preparationId);
    expect(stored.rows.Cases).toHaveLength(4); expect(files.size).toBe(5);
});
it('rejects a second actor/request claiming the same source, without adopting its cases', async () => {
    driveFailure = 'after-create'; await expect(run()).rejects.toBeDefined();
    await expect(run({ ...body, requestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, { enviId: 8, systemRoleId: 1 })).rejects.toBeDefined();
    expect(Object.keys(stored.preparations)).toHaveLength(1); await run(); expect(stored.rows.Cases).toHaveLength(4);
});
it('refuses changed payload for the same key', async () => {
    driveFailure = 'reserve'; await expect(run()).rejects.toBeDefined();
    await expect(run({ ...body, expectedRevision: '0'.repeat(64) })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
});
it.each([undefined,{ enviId: 7, systemRoleId: 4 },{ enviId: 7, systemRoleId: 5 }])('denies unauthorized actor before I/O', async actor => {
    await expect(Controller.addFromDto(body, actor as any)).rejects.toBeDefined(); expect(Drive.reserve).not.toHaveBeenCalled(); expect(conn.beginTransaction).not.toHaveBeenCalled();
});
it('rechecks role after an external effect and permits later authorized recovery', async () => {
    afterDrive = () => { user.systemRoleId = 4; afterDrive = undefined; };
    await expect(run()).rejects.toMatchObject({ code: 'ROLE_DENIED' });
    user.systemRoleId = 1; await run(); expect(files.size).toBe(5);
});
it('rechecks current and original scope on replay', async () => {
    await run(); const count = (Drive.create as jest.Mock).mock.calls.length;
    await expect(run(body,user,{projectOurIds:[]})).rejects.toBeDefined(); expect(Drive.create).toHaveBeenCalledTimes(count);
});
it.each(['Number','ParentCaseId','GdFolderId','Name'])('refuses tampered owned %s instead of recreating the target', async field => {
    driveFailure = 'after-create'; await expect(run()).rejects.toBeDefined();
    stored.rows.Cases.find((c: any) => c.MilestoneId === b)[field] = 999;
    await expect(run()).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' }); expect(files.size).toBe(3);
});
it('refuses a deleted owned case and preserves remote objects', async () => {
    driveFailure = 'after-create'; await expect(run()).rejects.toBeDefined(); stored.rows.Cases = stored.rows.Cases.filter((c: any) => c.MilestoneId !== b);
    await expect(run()).rejects.toMatchObject({ code: 'RECONCILIATION_REQUIRED' }); expect(files.size).toBe(3);
});
it.each(['name','parents','appProperties','trashed'])('refuses changed remote %s', async field => {
    driveFailure = 'after-create'; await expect(run()).rejects.toBeDefined();
    files.get(journal().folders[0].id)[field] = field === 'parents' ? ['foreign'] : field === 'appProperties' ? {} : field === 'trashed' ? true : 'renamed';
    await expect(run()).rejects.toMatchObject({ code: 'DRIVE_STATE_UNCERTAIN' }); expect(files.size).toBe(3);
});
it('missing confirmed folder does not reserve a replacement', async () => {
    await run(); files.delete(journal().folders[0].id);
    await expect(run()).rejects.toMatchObject({ code: 'DRIVE_STATE_UNCERTAIN' }); expect(Drive.reserve).toHaveBeenCalledTimes(3);
});
it('number or name changes after intent block before another external effect', async () => {
    driveFailure = 'reserve'; await expect(run()).rejects.toBeDefined();
    stored.rows.Cases.push({ Id: 900, MilestoneId: b, TypeId: 50, Number: 1, Name: 'Nowy', ParentCaseId: null, GdFolderId: 'other' });
    await expect(run()).rejects.toMatchObject({ code: 'STALE_REVISION' }); expect(Drive.create).not.toHaveBeenCalled();
});
it('refuses a global folder alias outside the preview project', async () => {
    const aliases = require('../ConsolidationPreparationRepository').default;
    jest.spyOn(aliases.prototype, 'aliases').mockResolvedValue([{ table: 'Letters', key: '99' }]);
    await expect(run()).rejects.toMatchObject({ code: 'FOLDER_ALIAS' }); expect(Drive.create).not.toHaveBeenCalled();
});
it('unique root uses one folder and no type-folder cache', async () => {
    staged.rows.Cases = staged.rows.Cases.filter((c: any) => c.Id === a);
    staged.rows.CaseTypes[0].IsUniquePerMilestone = 1;
    preview([{ sourceCaseId: a, target: { mode: 'create', caseTypeId: 50, name: '', parentSourceCaseId: null } }]);
    await run(); expect(Drive.create).toHaveBeenCalledTimes(1); expect(stored.rows.CaseTypeFolders).toEqual([]);
});
it('uses a registered type folder without claiming ownership or creating another one', async () => {
    staged.rows.CaseTypeFolders.push({ MilestoneId: b, CaseTypeId: 50, GdFolderId: 'mock:cached' });
    files.set('mock:cached', file('mock:cached', 'mock:dest', '01 Sprawy')); preview();
    await run(); expect(Drive.create).toHaveBeenCalledTimes(2); expect(journal().folders[0].owned).toBe(false);
});
it('refuses historical missing type cache with existing sibling cases', () => {
    staged.rows.Cases.push({ Id: 900, MilestoneId: b, TypeId: 50, Number: 1, ParentCaseId: null, GdFolderId: 'old' });
    const p = preview(); expect(() => Validator.initial(Preview.serialize(p))).toThrow('RECONCILIATION_REQUIRED');
});
it('rejects wrong parent mapping and schema drift before saving intent', async () => {
    const p = preview([{ sourceCaseId: a, target: { mode: 'create', caseTypeId: 50, name: 'Nowy', parentSourceCaseId: null } },
        { sourceCaseId: child, target: { mode: 'create', caseTypeId: 50, name: 'Dziecko', parentSourceCaseId: null } }]);
    await expect(run()).rejects.toMatchObject({ code: 'INVALID_PARENT_MAPPING' }); expect(journal()).toBeUndefined();
    expect(Preparation.request(Preparation.create(Preview.serialize(p),7,body.requestId)).mappings).toBeDefined();
});
it('routes preparation through the controller with session and scope', async () => {
    const route: any = (Router as any).stack.find((x: any) => x.route?.path === '/milestone-consolidations/prepare-targets');
    const spy = jest.spyOn(Controller,'addFromDto').mockResolvedValue({ state: 'PREPARED' } as any);
    const res = { send: jest.fn() }, next = jest.fn(), scope = { projectOurIds: ['synthetic'] };
    await route.route.stack[0].handle({body,session:{userData:user},projectScope:scope},res,next);
    expect(spy).toHaveBeenCalledWith(body,user,scope); expect(next).not.toHaveBeenCalled();
});
it('preserves numbering order when child ID precedes another root and its parent', async () => {
    staged.rows.Cases = [
        { ...staged.rows.Cases[0], Id: 1, ParentCaseId: 3 },
        { ...staged.rows.Cases[0], Id: 2, ParentCaseId: null },
        { ...staged.rows.Cases[0], Id: 3, ParentCaseId: null },
    ];
    staged.rows.Tasks = [];
    fixture.snapshot.nameWeights.push({name:'Third',weight:'third'});
    preview([
        { sourceCaseId: 1, target: { mode:'create', caseTypeId:50, name:'Dziecko', parentSourceCaseId:3 } },
        { sourceCaseId: 2, target: { mode:'create', caseTypeId:50, name:'Third', parentSourceCaseId:null } },
        { sourceCaseId: 3, target: { mode:'create', caseTypeId:50, name:'Nowy', parentSourceCaseId:null } },
    ]);
    await run(); expect(journal().cases.map((c:any)=>[c.sourceId,c.number])).toEqual([[3,1],[1,2],[2,3]]);
});
it('uses the existing type-name convention for a unique child folder', async () => {
    staged.rows.CaseTypes.push({ ...staged.rows.CaseTypes[0],Id:51,IsUniquePerMilestone:1,Name:'Unikalna',FolderNumber:'02' });
    staged.rows.CaseType_SubCaseTypes.push({ParentCaseTypeId:50,SubCaseTypeId:51});
    staged.rows.Cases.find((c:any)=>c.Id===child).TypeId=51;
    preview([
        { sourceCaseId:a,target:{mode:'create',caseTypeId:50,name:'Nowy',parentSourceCaseId:null}},
        { sourceCaseId:child,target:{mode:'create',caseTypeId:51,name:'',parentSourceCaseId:a}},
    ]);
    await run(); const target=journal().cases.find((c:any)=>c.sourceId===child);
    expect(files.get(target.row.GdFolderId).name).toBe('02 Unikalna');
});
it('prepares a child under an explicitly existing parent with verified folder', async () => {
    staged.rows.Cases.push({Id:900,MilestoneId:b,TypeId:50,ParentCaseId:null,Number:1,Name:'Nowy',GdFolderId:'mock:existing-parent'});
    files.set('mock:existing-parent',file('mock:existing-parent','mock:dest','S01 Nowy'));
    preview([
        {sourceCaseId:a,target:{mode:'existing',caseId:900}},
        {sourceCaseId:child,target:{mode:'create',caseTypeId:50,name:'Dziecko',parentSourceCaseId:a}},
    ]);
    await run(); expect(journal().cases[0].row.ParentCaseId).toBe(900);
    expect(files.get(journal().cases[0].row.GdFolderId).parents).toEqual(['mock:existing-parent']);
    expect(Drive.create).toHaveBeenCalledTimes(1);
});
it('reloads all controller/lifecycle modules and resumes only persisted JSON after a lost create response', async () => {
    driveFailure='after-create'; await expect(run()).rejects.toBeDefined(); stored=clone(stored); staged=clone(stored);
    let Fresh: typeof Controller;
    jest.isolateModules(()=>{
        Fresh=require('../ConsolidationPreparationController').default;
        const db=require('../../../../tools/ToolsDb').default;
        db.pool.getConnection.mockResolvedValue(conn);
        const transport=require('../ConsolidationPreparationDrive').default;
        for(const name of ['reserve','get','create']) transport[name]=(Drive as any)[name];
        require('../ConsolidationEffectsRepository').default.prototype.readEffects=async()=>snapshot();
    });
    await Fresh!.addFromDto(body,user,undefined,{} as any);
    expect(stored.rows.Cases).toHaveLength(4); expect(files.size).toBe(5);
});
it('detects actual trigger number mismatch and rolls back the new case before any Drive effect', async () => {
    const query=conn.query;
    conn.query=jest.fn(async(input:any,values:any[])=>{
        const result=await query(input,values);
        if(typeof input==='string'&&input.startsWith('INSERT INTO Cases')) staged.rows.Cases[staged.rows.Cases.length-1].Number=99;
        return result;
    });
    await expect(run()).rejects.toMatchObject({code:'NUMBER_CONFLICT'});
    expect(stored.rows.Cases).toHaveLength(2); expect(journal().cases.every((c:any)=>!c.row)).toBe(true);
    expect(Drive.create).not.toHaveBeenCalled();
});
it('rejects unknown numbering triggers before intent or effects', async()=>{
    fixture.snapshot.caseTriggers[0].ACTION_STATEMENT+=' altered'; preview();
    await expect(run()).rejects.toMatchObject({code:'NUMBERING_SCHEMA_UNVERIFIED'});
    expect(journal()).toBeUndefined(); expect(Drive.reserve).not.toHaveBeenCalled();
});
it('rejects a new request concurrently attempting the same create',async()=>{
    const results=await Promise.allSettled([run(),run({...body,requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'})]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(Object.keys(stored.preparations)).toHaveLength(1); expect(stored.rows.Cases).toHaveLength(4);
});
it('does not adopt historical partial operations',async()=>{
    stored.operations=[{OperationId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}];
    await expect(run()).rejects.toMatchObject({code:'OPERATION_IN_PROGRESS'});
    expect(journal()).toBeUndefined(); expect(Drive.create).not.toHaveBeenCalled();
});
it('prepares a remaining explicit create during a known durable partial operation',async()=>{
    const source=staged.rows.Cases.find((c:any)=>c.Id===child); source.ParentCaseId=null; source.SubCaseNumber=null;
    staged.rows.Cases.push({Id:900,MilestoneId:b,TypeId:50,ParentCaseId:null,Number:1,Name:'Nowy',GdFolderId:'mock:existing'});
    staged.rows.CaseTypeFolders.push({MilestoneId:b,CaseTypeId:50,GdFolderId:'mock:cached'});
    files.set('mock:cached',file('mock:cached','mock:dest','01 Sprawy'));
    files.set('mock:existing',file('mock:existing','mock:cached','S01 Nowy'));
    const mappings=[{sourceCaseId:a,target:{mode:'existing',caseId:900}},
        {sourceCaseId:child,target:{mode:'create',caseTypeId:50,name:'Dziecko',parentSourceCaseId:null}}];
    const p=preview(mappings), operationId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const record=Operation.first(Preview.serialize(p),{...body,unitIds:[p.units.find(u=>u.unitKey===`cases:${a}`)!.unitId]},operationId,7);
    staged.operations=[record]; staged.rows.Tasks[0].CaseId=900;
    preview(mappings,operationId);
    await run(); expect(journal().cases).toHaveLength(1); expect(stored.rows.Tasks[0].CaseId).toBe(900);
    expect(Preview.restore(stored.previews[Object.keys(stored.previews).at(-1)!]).content.request.operationId).toBe(operationId);
});
it('rolls back when begin succeeds but its response is lost',async()=>{
    conn.beginTransaction.mockImplementationOnce(async()=>{inTransaction=true;staged=clone(stored);throw new Error('lost begin response');});
    await expect(run()).rejects.toMatchObject({code:'RETRYABLE_STORAGE_ERROR'});
    expect(conn.rollback).toHaveBeenCalled();expect(inTransaction).toBe(false);expect(journal()).toBeUndefined();
});

it('logs only safe SQL diagnostics when the preparation intent cannot be read', async () => {
    const query = conn.query.getMockImplementation();
    conn.query.mockImplementation(async (sql: any, values: any[]) => {
        if (String(sql).startsWith('SELECT PreviewId,')) throw Object.assign(new Error('secret query and token'), {
            code: 'ER_NO_SUCH_TABLE', sqlState: '42S02', errno: 1146,
            sql: 'SELECT secret', sqlMessage: 'private values', config: { headers: { Authorization: 'private token' } }
        });
        return query(sql, values);
    });
    await expect(run()).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR', status: 503 });
    expect(console.error).toHaveBeenCalledWith('[PS-MC][prepare-targets]', {
        stage: 'SAVE_INTENT', code: 'ER_NO_SUCH_TABLE', sqlState: '42S02', errno: 1146, httpStatus: undefined
    });
    expect(JSON.stringify((console.error as jest.Mock).mock.calls)).not.toMatch(/secret|private|Authorization/);
    expect(journal()).toBeUndefined();
});

it('identifies authentication failures without logging their messages or credentials', async () => {
    jest.spyOn(Controller as any, 'withAuth').mockRejectedValueOnce(Object.assign(new Error('secret refresh token'), {
        code: 'not a safe code: secret', response: { status: 401, data: { refresh_token: 'private' } }
    }));
    await expect(run()).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR', status: 503 });
    expect(console.error).toHaveBeenCalledWith('[PS-MC][prepare-targets]', {
        stage: 'AUTHENTICATE', code: 'UNEXPECTED_ERROR', sqlState: undefined, errno: undefined, httpStatus: 401
    });
    expect(JSON.stringify((console.error as jest.Mock).mock.calls)).not.toMatch(/secret|private|refresh_token/);
    expect(journal().requestId).toBe(body.requestId);
});

it('keeps the retryable outcome even if the diagnostic logger fails', async () => {
    (ToolsDb.pool.getConnection as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('connection lost'), {code:'ECONNRESET'}));
    (console.error as jest.Mock).mockImplementationOnce(() => { throw new Error('logger failed'); });
    await expect(run()).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR', status: 503 });
    expect(journal()).toBeUndefined();
});

it('does not report ordinary input validation as a server failure', async () => {
    await expect(run({ ...body, unexpected: true })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(console.error).not.toHaveBeenCalled();
});

it('identifies lifecycle lock refusal without reporting raw error data', async () => {
    const query = conn.query.getMockImplementation();
    conn.query.mockImplementation(async (sql: any, values: any[]) =>
        String(sql).includes('GET_LOCK') ? [[{ ok: 0 }]] : query(sql, values));
    await expect(run()).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR', status: 503 });
    expect(console.error).toHaveBeenCalledWith('[PS-MC][prepare-targets]', {
        stage: 'LIFECYCLE_LOCK', code: 'RETRYABLE_STORAGE_ERROR', sqlState: undefined, errno: undefined, httpStatus: undefined
    });
    expect(journal()).toBeUndefined();
});

it('resumes the saved preparation after a FolderId inventory failure without duplicate cases or folders', async () => {
    const Repository = require('../ConsolidationPreparationRepository').default;
    const aliases = jest.spyOn(Repository.prototype, 'aliases').mockRejectedValueOnce(new Error('UNVERIFIED_FOLDER_SCHEMA'));
    await expect(run()).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR' });
    const savedId = journal().id;
    const savedCaseIds = stored.rows.Cases.map((c: any) => c.Id);
    expect(savedCaseIds).toHaveLength(3); // First new row was durably saved before the inventory check.
    expect(Drive.create).not.toHaveBeenCalled();
    aliases.mockRestore();
    const query = conn.query.getMockImplementation();
    conn.query.mockImplementation(async (input: any, values: any[]) => {
        const sql = typeof input === 'string' ? input : input.sql;
        if (sql.includes('FROM `fundingfolderintents`')) return [[{ n: 0 }]];
        const result = await query(input, values);
        if (sql.startsWith('SELECT TABLE_NAME, COLUMN_NAME')) result[0].push({ TABLE_NAME: 'fundingfolderintents', COLUMN_NAME: 'FolderId' });
        return result;
    });
    await expect(run()).resolves.toMatchObject({ preparationId: savedId, state: 'PREPARED' });
    expect(savedCaseIds.every((id: number) => stored.rows.Cases.some((c: any) => c.Id === id))).toBe(true);
    expect(stored.rows.Cases).toHaveLength(4);
    expect(stored.rows.Tasks).toEqual(original.Tasks);
    const reserved = (Drive.reserve as jest.Mock).mock.calls.length;
    const created = (Drive.create as jest.Mock).mock.calls.length;
    expect(created).toBe(3);
    await expect(run()).resolves.toMatchObject({ preparationId: savedId, state: 'PREPARED' });
    expect(stored.rows.Cases).toHaveLength(4);
    expect(Drive.reserve).toHaveBeenCalledTimes(reserved);
    expect(Drive.create).toHaveBeenCalledTimes(created);
});

it('prepares folders when Drive omits optional appProperties on an existing parent', async () => {
    for (const metadata of files.values()) delete metadata.appProperties;
    const result = await run();
    expect(result).toMatchObject({ state: 'PREPARED', transferPerformed: false });
    expect(stored.rows.Tasks).toEqual(original.Tasks);
    expect(stored.rows.Cases).toHaveLength(4);
    expect(Drive.create).toHaveBeenCalledTimes(3);
    const ids = stored.rows.Cases.map((c: any) => c.Id);
    await expect(run()).resolves.toMatchObject({ preparationId: result.preparationId, state: 'PREPARED' });
    expect(stored.rows.Cases.map((c: any) => c.Id)).toEqual(ids);
    expect(Drive.create).toHaveBeenCalledTimes(3);
});
it('still refuses appProperties added to a parent between the two Drive reads', async () => {
    const destination = fixture.snapshot.rows.Milestones.find((m: any) => m.Id === b).GdFolderId;
    delete files.get(destination).appProperties;
    afterDrive = () => { files.get(destination).appProperties = { changedDuringPreparation: 'yes' }; afterDrive = undefined; };
    await expect(run()).rejects.toMatchObject({ code: 'DRIVE_STATE_UNCERTAIN', status: 409 });
    expect(journal().folders[0].ready).toBe(false);
    expect(Drive.create).toHaveBeenCalledTimes(1);
});

it('resumes the exact saved request after a 400 during parent readback without recreating the folder', async () => {
    for (const metadata of files.values()) delete metadata.appProperties;
    const destination = fixture.snapshot.rows.Milestones.find((m: any) => m.Id === b).GdFolderId;
    const get = (Drive.get as jest.Mock).getMockImplementation()!;
    let parentReads = 0;
    (Drive.get as jest.Mock).mockImplementation(async (auth: any, id: string) => {
        if (id === destination && ++parentReads === 2) {
            const MappingError = require('../ConsolidationMappingValidator').ConsolidationMappingError;
            throw new MappingError('INVALID_SNAPSHOT');
        }
        return get(auth, id);
    });
    await expect(run()).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT', status: 400 });
    const savedId = journal().id;
    const folderId = journal().folders[0].id;
    expect(journal().folders[0]).toMatchObject({ attempted: true, ready: false });
    expect(files.has(folderId)).toBe(true);
    expect(Drive.create).toHaveBeenCalledTimes(1);
    (Drive.get as jest.Mock).mockImplementation(get);
    await expect(run()).resolves.toMatchObject({ preparationId: savedId, state: 'PREPARED' });
    expect(journal().folders[0].id).toBe(folderId);
    expect(stored.rows.Cases).toHaveLength(4);
    expect(stored.rows.Tasks).toEqual(original.Tasks);
    expect(Drive.create).toHaveBeenCalledTimes(3);
});
