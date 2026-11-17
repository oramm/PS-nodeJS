jest.mock('mysql2/promise', () => ({ ...jest.requireActual('mysql2/promise'),
    createPool: jest.fn(() => { throw new Error('REAL_DB_FORBIDDEN'); }),
}));
import ToolsDb from '../../../tools/ToolsDb';
import Controller from '../SecuritiesController';
import { Security } from '../Security';
import Cases from '../../milestones/cases/CasesController';
import Lifecycle from '../../milestones/sharing/MilestoneLifecycleController';

let destinations: number[];
let events: string[], sources: number[], storedCase: number | null, storedId: number;
let missingSecurity: boolean, missingCase: boolean, failRead: boolean, failDelete: boolean;
let writes: number[], caseEffects: number[];
const conn: any = { query: jest.fn(), execute: jest.fn(), release: jest.fn(), destroy: jest.fn(),
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn() };
const getConnection = jest.fn();
const dto = (): any => ({ id: 7, _contract: { id: 77 },
    _case: { id: 999, _type: { id: 1 }, _parent: { id: 999 } },
    description: 'synthetic security', value: 1000, returnedValue: 100, deductionValue: 25,
    firstPartRate: 70, secondPartRate: 30, isCash: true, status: 'ACTIVE' });

beforeEach(() => {
    jest.restoreAllMocks(); jest.clearAllMocks();
    events = []; sources = []; destinations = []; storedCase = 20; storedId = 7;
    missingSecurity = missingCase = failRead = failDelete = false; writes = []; caseEffects = [];
    jest.spyOn(ToolsDb, 'pool', 'get').mockReturnValue({ getConnection } as any);
    getConnection.mockResolvedValue(conn);
    conn.query.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('DestinationMilestoneId')) return [destinations.map(DestinationMilestoneId => ({DestinationMilestoneId}))];
        if (sql.includes('GET_LOCK')) { events.push('lock'); return [[{ ok: 1 }]]; }
        if (sql.includes('RELEASE_LOCK')) { events.push('unlock'); return [[{ ok: 1 }]]; }
        if (sql === 'SELECT Id, CaseId FROM Securities WHERE Id IN (?)') {
            events.push('security-read'); expect(params).toEqual([[7]]);
            if (failRead) throw new Error('private SQL failure');
            return [missingSecurity ? [] : [{ Id: storedId, CaseId: storedCase }]];
        }
        if (sql === 'SELECT Id, MilestoneId FROM Cases WHERE Id IN (?)') {
            events.push('case-read'); expect(params).toEqual([[20]]);
            return [missingCase ? [] : [{ Id: 20, MilestoneId: 120 }]];
        }
        if (sql.includes('WHERE SourceMilestoneId IN (?)')) {
            events.push('source-check'); expect(params).toEqual([[120]]);
            return [sources.map(SourceMilestoneId => ({ SourceMilestoneId }))];
        }
        throw new Error('Unexpected SQL: ' + sql);
    });
    conn.execute.mockImplementation(async (sql: string, values: any[]) => {
        expect(events).toContain('source-check'); expect(events).not.toContain('unlock');
        expect(sql).toBe('DELETE FROM Securities WHERE Id =?'); expect(values).toEqual([7]);
        events.push('security-delete');
        if (failDelete) throw new Error('injected delete failure');
        writes.push(values[0]); return [{ affectedRows: 1 }];
    });
    conn.beginTransaction.mockImplementation(async () => { events.push('begin'); });
    conn.commit.mockImplementation(async () => { events.push('commit'); });
    conn.rollback.mockImplementation(async () => { events.push('rollback'); });
    conn.release.mockImplementation(() => events.push('release'));
    // Preserve the real Cases.delete guard; stop before OAuth, DB cascades and Drive.
    jest.spyOn(Cases as any, 'deleteUnlocked').mockImplementation(async (item: any) => {
        expect(events).not.toContain('unlock'); events.push('case-effects'); caseEffects.push(item.id);
    });
});

it.each(['model', 'DTO', 'omitted-case'])('refuses stored source before any effects with %s context', async mode => {
    sources = [120]; const input = dto(); if (mode === 'omitted-case') delete input._case;
    await expect(mode === 'model' ? Controller.delete(new Security(input)) : Controller.deleteFromDto(input))
        .rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(writes).toEqual([]); expect(caseEffects).toEqual([]);
    expect(events.slice(-2)).toEqual(['unlock', 'release']);
});
it.each(['model', 'DTO', 'omitted-case'])('deletes only the persisted case for ordinary %s input', async mode => {
    const input = dto(); if (mode === 'omitted-case') delete input._case;
    await (mode === 'model' ? Controller.delete(new Security(input)) : Controller.deleteFromDto(input));
    expect(writes).toEqual([7]); expect(caseEffects).toEqual([20]);
    expect(events.filter(e => e === 'lock')).toHaveLength(1);
    expect(events.indexOf('source-check')).toBeLessThan(events.indexOf('security-delete'));
    expect(events.indexOf('commit')).toBeLessThan(events.indexOf('case-effects'));
    expect(events.indexOf('case-effects')).toBeLessThan(events.indexOf('unlock'));
});
it.each(['security', 'case', 'wrong-id', 'null-case'])('fails closed for missing or invalid persisted %s', async kind => {
    missingSecurity = kind === 'security'; missingCase = kind === 'case';
    if (kind === 'wrong-id') storedId = 77;
    if (kind === 'null-case') storedCase = null;
    await expect(Controller.deleteFromDto(dto())).rejects.toMatchObject({ code: kind === 'null-case' ? 'INVALID_SNAPSHOT' : 'OBJECT_NOT_FOUND' });
    expect(writes).toEqual([]); expect(caseEffects).toEqual([]);
});
it.each([undefined, null, 0, -1, NaN, '7', 7.5])('refuses invalid security ID %p before connection', async id => {
    await expect(Controller.deleteFromDto({ ...dto(), id })).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' });
    expect(getConnection).not.toHaveBeenCalled();
});
it('sanitizes read failure and allows retry before any effects', async () => {
    failRead = true;
    await expect(Controller.deleteFromDto(dto())).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR', message: 'RETRYABLE_STORAGE_ERROR' });
    expect(writes).toEqual([]); expect(caseEffects).toEqual([]);
    failRead = false; events = []; await Controller.deleteFromDto(dto()); expect(writes).toEqual([7]);
});
it('holds the lock through a failed delete and confirmed rollback before safe retry', async () => {
    failDelete = true;
    await expect(Controller.deleteFromDto(dto())).rejects.toThrow('injected delete failure');
    expect(writes).toEqual([]); expect(caseEffects).toEqual([]);
    expect(events.indexOf('rollback')).toBeLessThan(events.indexOf('unlock'));
    failDelete = false; events = []; await Controller.deleteFromDto(dto()); expect(writes).toEqual([7]);
});
it('keeps the lock through case failure without claiming rollback of prior security commit', async () => {
    (Cases as any).deleteUnlocked.mockImplementationOnce(async () => {
        expect(events).not.toContain('unlock'); events.push('case-failure'); throw new Error('case failure');
    });
    await expect(Controller.deleteFromDto(dto())).rejects.toThrow('case failure');
    expect(writes).toEqual([7]); expect(events).not.toContain('rollback');
    expect(events.indexOf('case-failure')).toBeLessThan(events.indexOf('unlock'));
});
it('rejects nesting in a DB-only lifecycle transaction before reading or deleting', async () => {
    await expect(Lifecycle.transaction(() => Controller.deleteFromDto(dto()))).rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    expect(events).not.toContain('security-read'); expect(writes).toEqual([]);
});
it('waits for a batch and reads its newly committed source state', async () => {
    let enter!: () => void, resume!: () => void;
    const ready = new Promise<void>(r => { enter = r; }); const hold = new Promise<void>(r => { resume = r; });
    const batch = Lifecycle.transaction(async () => { enter(); await hold; sources = [120]; });
    await ready;
    const refused = expect(Controller.deleteFromDto(dto())).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events).not.toContain('security-read'); resume(); await batch; await refused;
    expect(writes).toEqual([]); expect(events.filter(e => e === 'lock')).toHaveLength(2);
});
it('does not admit the next batch while downstream case effects are pending', async () => {
    let enter!: () => void, resume!: () => void;
    const ready = new Promise<void>(r => { enter = r; }); const hold = new Promise<void>(r => { resume = r; });
    (Cases as any).deleteUnlocked.mockImplementationOnce(async () => { enter(); await hold; events.push('case-done'); });
    const removal = Controller.deleteFromDto(dto()); await ready;
    const batch = Lifecycle.transaction(async () => { events.push('next-batch'); });
    expect(events).not.toContain('next-batch'); resume(); await removal; await batch;
    expect(events.indexOf('case-done')).toBeLessThan(events.indexOf('next-batch'));
});

it('refuses destination security cascade before deleting the security row', async () => {
    destinations = [120];
    await expect(Controller.deleteFromDto(dto())).rejects.toMatchObject({code:'OPERATION_IN_PROGRESS'});
    expect(writes).toEqual([]); expect(caseEffects).toEqual([]);
});
