jest.mock('../../../tools/ToolsDb', () => ({ __esModule: true, default: {
    pool: { getConnection: jest.fn() }, getQueryCallbackAsync: jest.fn(),
    addInDb: jest.fn(), editInDb: jest.fn(), deleteFromDb: jest.fn(), sqlToString: (v: any) => v,
} }));
import ToolsDb from '../../../tools/ToolsDb';
import Controller from '../ProcessInstancesController';
import Steps from '../ProcessStepInstancesController';
import Process from '../ProcessInstance';
import Step from '../ProcessStepInstance';
import Lifecycle from '../../../contracts/milestones/sharing/MilestoneLifecycleController';

let events: string[], sources: number[], storedCase: number, storedTask: number | null;
let missingProcess: boolean, missingTask: boolean, missingCase: boolean, failStep: boolean;
let writes: string[], snapshot: string[];
const conn: any = { query: jest.fn(), release: jest.fn(), destroy: jest.fn(),
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn() };
const payload = (caseId = 20, taskId: any = 40) => ({ id: 1, _case: { id: caseId }, _task: { id: taskId }, _process: { id: 5 } });
const item = (caseId = 20, taskId: any = 40) => new Process(payload(caseId, taskId));
const step = (processInstanceId = 1) => new Step({ processInstanceId, _processStep: { id: 7 }, _case: { id: 999 } });
beforeEach(() => {
    jest.restoreAllMocks(); jest.clearAllMocks(); events = []; sources = []; storedCase = 20; storedTask = 40;
    missingProcess = missingTask = missingCase = failStep = false; writes = []; snapshot = [];
    (Controller as any).instance = undefined; (Steps as any)._instance = undefined;
    (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
    conn.query.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('GET_LOCK')) { events.push('lock'); return [[{ ok: 1 }]]; }
        if (sql.includes('RELEASE_LOCK')) { events.push('unlock'); return [[{ ok: 1 }]]; }
        if (sql.includes('FROM ProcessInstances')) {
            events.push('process-read');
            return [missingProcess ? [] : params[0].map((Id: number) => ({ Id, CaseId: storedCase, TaskId: storedTask }))];
        }
        if (sql.includes('FROM Tasks')) {
            events.push('task-read');
            return [missingTask ? [] : params[0].map((Id: number) => ({ Id, CaseId: Id === 40 ? 20 : 30 }))];
        }
        if (sql.includes('FROM Cases')) {
            events.push('parents');
            return [missingCase ? [] : params[0].map((Id: number) => ({ Id, MilestoneId: Id + 100 }))];
        }
        if (sql.includes('FROM MilestoneConsolidationOperations')) {
            events.push('source-check');
            return [params[0].filter((id: number) => sources.includes(id)).map((SourceMilestoneId: number) => ({ SourceMilestoneId }))];
        }
        throw new Error('Unexpected SQL');
    });
    conn.beginTransaction.mockImplementation(async () => { events.push('begin'); snapshot = [...writes]; });
    conn.commit.mockImplementation(async () => { events.push('commit'); });
    conn.rollback.mockImplementation(async () => { events.push('rollback'); writes = [...snapshot]; });
    conn.release.mockImplementation(() => events.push('release'));
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockImplementation(async (sql: string) => {
        expect(sql).toContain('ProcessesSteps'); events.push('templates');
        return [{ Id: 7, Name: 'first' }, { Id: 8, Name: 'second' }];
    });
    (ToolsDb.addInDb as jest.Mock).mockImplementation(async (table, value, supplied, tx) => {
        expect(supplied).toBe(conn); expect(tx).toBe(true);
        events.push('insert:' + table);
        if (failStep && table === 'ProcessesStepsInstances' && value.processStepId === 8) throw new Error('injected step failure');
        writes.push(table); value.id = table === 'ProcessInstances' ? 101 : 200 + writes.length;
    });
    (ToolsDb.editInDb as jest.Mock).mockImplementation(async (_table, _value, supplied, tx) => {
        expect(supplied).toBe(conn); expect(tx).toBe(true); events.push('update'); writes.push('update');
    });
    (ToolsDb.deleteFromDb as jest.Mock).mockImplementation(async (_table, _value, supplied, tx) => {
        expect(supplied).toBe(conn); expect(tx).toBe(true); events.push('delete'); writes.push('delete');
    });
});
const calls: [string, () => Promise<unknown>][] = [
    ['add', () => Controller.add(item())],
    ['add DTO with steps', () => Controller.addFromDto(payload())],
    ['add with steps', () => Controller.addNewProcessStepsInstances(item())],
    ['edit DTO', () => Controller.editFromDto(payload())],
    ['edit model', () => Controller.edit(item())],
    ['delete', () => Controller.delete(item())],
    ['add step', () => Steps.add(step())],
];
it.each(calls)('refuses source %s before writes or template access', async (_, call) => {
    sources = [120];
    await expect(call()).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS', status: 409 });
    expect(writes).toEqual([]); expect(events).not.toContain('templates');
    expect(events.slice(-3)).toEqual(['rollback', 'unlock', 'release']);
});
it.each(calls)('retains ordinary %s under one connection and one transaction', async (_, call) => {
    sources = [999]; await call();
    expect(ToolsDb.pool.getConnection).toHaveBeenCalledTimes(1);
    expect(events.slice(0, 2)).toEqual(['lock', 'begin']);
    expect(events.slice(-3)).toEqual(['commit', 'unlock', 'release']);
    expect(writes.length).toBeGreaterThan(0);
});
it.each(['edit', 'delete', 'step'])('guards the persisted case despite forged %s context', async mode => {
    sources = [120];
    const action = mode === 'edit' ? Controller.edit(item(30, 50)) : mode === 'delete' ? Controller.delete(item(30, 50)) : Steps.add(step());
    await expect(action).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' }); expect(writes).toEqual([]);
});
it.each(['edit', 'delete', 'step'])('guards the persisted task parent even when process case differs: %s', async mode => {
    storedCase = 30; sources = [120];
    const action = mode === 'edit' ? Controller.edit(item(30, 50)) : mode === 'delete' ? Controller.delete(item(30, 50)) : Steps.add(step());
    await expect(action).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' }); expect(writes).toEqual([]);
});
it.each(['caseId', 'taskId'])('guards a selected new %s', async field => {
    sources = [130];
    await expect(Controller.edit(item(30, 50), undefined, false, [field])).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
});
it('ignores non-selected parents and preserves partial field selection', async () => {
    sources = [130]; const value = item(30, 50);
    await Controller.edit(value, undefined, false, ['editorId']);
    expect(ToolsDb.editInDb).toHaveBeenCalledWith('ProcessInstances', value, conn, true, ['editorId']);
});
it.each(['add', 'steps'] as const)('guards task parent on %s creation', async method => {
    sources = [130];
    await expect(method === 'add' ? Controller.add(item(20, 50)) : Controller.addNewProcessStepsInstances(item(20, 50)))
        .rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(writes).toEqual([]);
});
it.each([undefined, null])('retains optional task %p', async taskId => {
    storedTask = null;
    const value = item(); value.taskId = taskId as any;
    await Controller.add(value); await Controller.edit(value); await Steps.add(step());
    expect(events).not.toContain('task-read'); expect(writes).toHaveLength(3);
});
it.each(['process', 'task', 'case'])('fails closed when persisted %s is missing', async kind => {
    missingProcess = kind === 'process'; missingTask = kind === 'task'; missingCase = kind === 'case';
    await expect(Steps.add(step())).rejects.toMatchObject({ code: 'OBJECT_NOT_FOUND' });
    expect(writes).toEqual([]); expect(events).toContain('rollback');
});
it.each([undefined, null, 0, -1, NaN, '1 OR 1=1', 1.5])('rejects invalid process ID %p before connection', async id => {
    const value = item(); value.id = id as any;
    await expect(Controller.delete(value)).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' });
    await expect(Steps.add(new Step({ processInstanceId: id }))).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' });
    expect(ToolsDb.pool.getConnection).not.toHaveBeenCalled();
});
it.each(['add', 'edit', 'delete', 'addNewProcessStepsInstances'] as const)('rejects unowned context for %s', async method => {
    for (const [connection, tx] of [[conn, true], [conn, false], [undefined, true]] as const)
        await expect(Controller[method](item(), connection, tx)).rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    expect(events).toEqual([]);
});
it('rejects unowned step contexts', async () => {
    for (const [connection, tx] of [[conn, true], [conn, false], [undefined, true]] as const)
        await expect(Steps.add(step(), connection, tx)).rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    expect(events).toEqual([]);
});
it.each(calls)('rejects nested %s without opening another connection', async (_, call) => {
    await expect(Lifecycle.transaction(call)).rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    expect(ToolsDb.pool.getConnection).toHaveBeenCalledTimes(1); expect(writes).toEqual([]);
});
it('rolls back process and first step when second step fails; same object retries cleanly', async () => {
    const value = item(); failStep = true;
    await expect(Controller.addNewProcessStepsInstances(value)).rejects.toThrow('injected step failure');
    expect(writes).toEqual([]); expect(value._stepsInstances).toEqual([]);
    expect(events.slice(-3)).toEqual(['rollback', 'unlock', 'release']);
    failStep = false; await Controller.addNewProcessStepsInstances(value);
    expect(writes).toEqual(['ProcessInstances', 'ProcessesStepsInstances', 'ProcessesStepsInstances']);
    expect(value._stepsInstances.map(s => s.processStepId)).toEqual([7, 8]);
    expect(value._stepsInstances.every(s => s.processInstanceId === 101)).toBe(true);
});
it('rolls back after commit failure without appending unsaved steps; retry works', async () => {
    conn.commit.mockRejectedValueOnce(new Error('commit failure')); const value = item();
    await expect(Controller.addNewProcessStepsInstances(value)).rejects.toThrow('commit failure');
    expect(writes).toEqual([]); expect(value._stepsInstances).toEqual([]);
    await Controller.addNewProcessStepsInstances(value); expect(value._stepsInstances).toHaveLength(2);
});
it('fails closed on guard read failure without leaking SQL and then permits retry', async () => {
    conn.query.mockImplementationOnce(async () => [[{ ok: 1 }]]).mockRejectedValueOnce(new Error('private SQL'));
    await expect(Controller.edit(item())).rejects.toMatchObject({ code: 'RETRYABLE_STORAGE_ERROR', message: 'RETRYABLE_STORAGE_ERROR' });
    expect(writes).toEqual([]); expect(events.slice(-3)).toEqual(['rollback', 'unlock', 'release']);
    await Controller.edit(item()); expect(writes).toEqual(['update']);
});
it('waits for a batch and reads its committed source before creating a step', async () => {
    let enter!: () => void, resume!: () => void;
    const ready = new Promise<void>(r => { enter = r; }); const hold = new Promise<void>(r => { resume = r; });
    const batch = Lifecycle.transaction(async () => { enter(); await hold; sources = [120]; });
    await ready; const pending = Steps.add(step());
    const denied = expect(pending).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events).not.toContain('process-read'); resume(); await batch; await denied;
    expect(writes).toEqual([]); expect(events.filter(e => e === 'lock')).toHaveLength(2);
});

it('treats empty fields as a full update, matching ToolsDb SQL', async () => {
    sources = [130];
    await expect(Controller.edit(item(30, 40), undefined, false, [])).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    await expect(Controller.edit(item(20, 50), undefined, false, [])).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(writes).toEqual([]);
});
