jest.mock('mysql2/promise', () => ({ ...jest.requireActual('mysql2/promise'),
    createPool: jest.fn(() => { throw new Error('REAL_DB_FORBIDDEN'); }),
}));
import ToolsDb from '../../../tools/ToolsDb';
import Controller from '../SecuritiesController';
import { Security } from '../Security';
import Lifecycle from '../../milestones/sharing/MilestoneLifecycleController';

let events: string[], sources: number[], storedCase: number | null, storedId: number;
let missingSecurity: boolean, missingCase: boolean, failRead: boolean, failWrite: boolean;
let writes: { sql: string; values: any[] }[], snapshot: typeof writes;
const conn: any = { query: jest.fn(), execute: jest.fn(), release: jest.fn(), destroy: jest.fn(),
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn() };
const getConnection = jest.fn();
const dto = (caseId = 30): any => ({ id: 7, _contract: { id: 77 },
    _case: { id: caseId, _type: { id: 1 }, _parent: { id: 130 } },
    description: 'synthetic security', value: 1000, returnedValue: 100, deductionValue: 25,
    firstPartRate: 70, secondPartRate: 30, isCash: true, status: 'ACTIVE' });
const item = (caseId?: number) => { const value = new Security(dto()); value.caseId = caseId; return value; };

beforeEach(() => {
    jest.restoreAllMocks(); jest.clearAllMocks();
    events = []; sources = []; storedCase = 20; storedId = 7;
    missingSecurity = missingCase = failRead = failWrite = false; writes = []; snapshot = [];
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(ToolsDb, 'pool', 'get').mockReturnValue({ getConnection } as any);
    getConnection.mockResolvedValue(conn);
    conn.query.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('GET_LOCK')) { events.push('lock'); return [[{ ok: 1 }]]; }
        if (sql.includes('RELEASE_LOCK')) { events.push('unlock'); return [[{ ok: 1 }]]; }
        if (sql === 'SELECT Id, CaseId FROM Securities WHERE Id IN (?)') {
            events.push('security-read'); expect(params).toEqual([[7]]);
            if (failRead) throw new Error('private SQL failure');
            return [missingSecurity ? [] : [{ Id: storedId, CaseId: storedCase }]];
        }
        if (sql === 'SELECT Id, MilestoneId FROM Cases WHERE Id IN (?)') {
            events.push('case-read');
            return [missingCase ? [] : params[0].map((Id: number) => ({ Id, MilestoneId: Id + 100 }))];
        }
        if (sql.includes('WHERE SourceMilestoneId IN (?)')) {
            events.push('source-check');
            return [params[0].filter((id: number) => sources.includes(id)).map((SourceMilestoneId: number) => ({ SourceMilestoneId }))];
        }
        throw new Error('Unexpected SQL');
    });
    conn.execute.mockImplementation(async (sql: string, values: any[]) => {
        expect(events).toContain('begin'); expect(events).toContain('source-check');
        expect(events).not.toContain('unlock');
        expect(sql).toMatch(/^UPDATE Securities SET /); expect(values.at(-1)).toBe(7);
        events.push('write'); writes.push({ sql, values });
        if (failWrite) throw new Error('injected write failure');
        return [{ affectedRows: 1 }];
    });
    conn.beginTransaction.mockImplementation(async () => { events.push('begin'); snapshot = [...writes]; });
    conn.commit.mockImplementation(async () => { events.push('commit'); });
    conn.rollback.mockImplementation(async () => { events.push('rollback'); writes = [...snapshot]; });
    conn.release.mockImplementation(() => events.push('release'));
});

it.each(['model', 'DTO'])('refuses persisted source despite forged %s context', async mode => {
    sources = [120];
    await expect(mode === 'model' ? Controller.edit(item(30)) : Controller.editFromDto(dto(30)))
        .rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(writes).toEqual([]); expect(events.slice(-3)).toEqual(['rollback', 'unlock', 'release']);
});
it('refuses a newly selected source case', async () => {
    sources = [130];
    await expect(Controller.edit(item(30))).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(writes).toEqual([]);
});
it.each(['model', 'DTO'])('preserves ordinary %s values and legal contract under one transaction', async mode => {
    sources = [999];
    const result = await (mode === 'model' ? Controller.edit(item(30)) : Controller.editFromDto(dto()));
    expect(getConnection).toHaveBeenCalledTimes(1);
    expect(events.slice(0, 3)).toEqual(['lock', 'begin', 'security-read']);
    expect(events.slice(-4)).toEqual(['write', 'commit', 'unlock', 'release']);
    expect(writes).toHaveLength(1);
    const { sql, values } = writes[0];
    const columns = [...sql.matchAll(/`([^`]+)`=\?/g)].map(match => match[1]);
    const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
    expect(row).toMatchObject({ ContractId: 77, Value: 1000, ReturnedValue: 100, DeductionValue: 25 });
    expect(row.CaseId).toBe(mode === 'model' ? 30 : undefined);
    expect(result.contractId).toBe(77);
});
it('does not treat non-persisted DTO _case as a CaseId update', async () => {
    sources = [130]; await Controller.editFromDto(dto(30));
    expect(writes[0].sql).not.toContain('`CaseId`');
    expect(conn.query).toHaveBeenCalledWith('SELECT Id, MilestoneId FROM Cases WHERE Id IN (?)', [[20]]);
});
it.each(['security', 'case', 'wrong-id', 'null-case'])('fails closed for missing or invalid persisted %s', async kind => {
    missingSecurity = kind === 'security'; missingCase = kind === 'case';
    if (kind === 'wrong-id') storedId = 77;
    if (kind === 'null-case') storedCase = null;
    await expect(Controller.edit(item())).rejects.toMatchObject({ code: kind === 'null-case' ? 'INVALID_SNAPSHOT' : 'OBJECT_NOT_FOUND' });
    expect(writes).toEqual([]); expect(events).not.toContain('commit');
});
it.each([undefined, null, 0, -1, NaN, '7', 7.5])('refuses invalid ID %p before connection', async id => {
    const value = item(); value.id = id as any;
    await expect(Controller.edit(value)).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' });
    expect(getConnection).not.toHaveBeenCalled();
});
it.each([null, 0, -1, NaN, '30', 30.5])('refuses invalid new CaseId %p before connection', async id => {
    await expect(Controller.edit(item(id as any))).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' });
    expect(getConnection).not.toHaveBeenCalled();
});
it('sanitizes guard read failures and releases the lock for retry', async () => {
    failRead = true;
    await expect(Controller.edit(item())).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR', message: 'RETRYABLE_STORAGE_ERROR' });
    expect(writes).toEqual([]); expect(events.slice(-3)).toEqual(['rollback', 'unlock', 'release']);
    failRead = false; events = []; await Controller.edit(item()); expect(writes).toHaveLength(1);
});
it('rolls back an injected write failure and permits retry of the same object', async () => {
    failWrite = true; const value = item(30);
    await expect(Controller.edit(value)).rejects.toThrow('injected write failure');
    expect(writes).toEqual([]); expect(events.slice(-3)).toEqual(['rollback', 'unlock', 'release']);
    failWrite = false; events = []; await Controller.edit(value); expect(writes).toHaveLength(1);
});
it('keeps the lock until confirmed rollback of a failed synthetic commit', async () => {
    conn.commit.mockRejectedValueOnce(new Error('synthetic commit failure'));
    await expect(Controller.edit(item())).rejects.toThrow('synthetic commit failure');
    expect(writes).toEqual([]); expect(events.slice(-3)).toEqual(['rollback', 'unlock', 'release']);
});
it.each(['transaction', 'run'] as const)('rejects nested ordinary edit inside lifecycle %s', async method => {
    await expect(Lifecycle[method](() => Controller.edit(item()))).rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    expect(getConnection).toHaveBeenCalledTimes(1); expect(writes).toEqual([]);
});
it('waits for a batch commit and checks its fresh source state', async () => {
    let enter!: () => void, resume!: () => void;
    const ready = new Promise<void>(r => { enter = r; }); const hold = new Promise<void>(r => { resume = r; });
    const batch = Lifecycle.transaction(async () => { enter(); await hold; sources = [120]; });
    await ready;
    const refused = expect(Controller.edit(item())).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events).not.toContain('security-read'); resume(); await batch; await refused;
    expect(writes).toEqual([]); expect(events.filter(event => event === 'lock')).toHaveLength(2);
});
