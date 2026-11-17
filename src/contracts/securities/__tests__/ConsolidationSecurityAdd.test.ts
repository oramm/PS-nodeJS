jest.mock('mysql2/promise', () => ({ ...jest.requireActual('mysql2/promise'),
    createPool: jest.fn(() => { throw new Error('REAL_DB_FORBIDDEN'); }),
}));
import ToolsDb from '../../../tools/ToolsDb';
import Controller from '../SecuritiesController';
import { Security } from '../Security';
import Cases from '../../milestones/cases/CasesController';
import CaseTypes from '../../milestones/cases/caseTypes/CaseTypesController';
import Milestones from '../../milestones/MilestonesController';
import Lifecycle from '../../milestones/sharing/MilestoneLifecycleController';

let events: string[], sources: number[], writes: { sql: string; values: any[] }[];
let failWrite: boolean, failRead: boolean, failCase: boolean, failCommit: boolean;
let afterCase: (() => void) | undefined, afterInsert: (() => Promise<void>) | undefined;
const getConnection = jest.fn();
const dto = (): any => ({ _contract: { id: 77 }, description: 'synthetic security',
    value: 1000, returnedValue: 100, deductionValue: 25, firstPartRate: 70,
    secondPartRate: 30, isCash: true, status: 'ACTIVE',
    _case: { id: 999, _type: { id: 1 }, _parent: { id: 999 } } });

beforeEach(() => {
    jest.restoreAllMocks(); jest.clearAllMocks();
    events = []; sources = []; writes = [];
    failWrite = failRead = failCase = failCommit = false;
    afterCase = afterInsert = undefined;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(ToolsDb, 'pool', 'get').mockReturnValue({ getConnection } as any);
    getConnection.mockImplementation(async () => {
        let snapshot = [...writes];
        return {
            query: async (sql: string, params: any[]) => {
                if (sql.includes('GET_LOCK')) { events.push('lock'); return [[{ ok: 1 }]]; }
                if (sql.includes('RELEASE_LOCK')) { events.push('unlock'); return [[{ ok: 1 }]]; }
                if (sql.includes('WHERE SourceMilestoneId IN (?)')) {
                    events.push('source-check'); expect(params).toEqual([[120]]);
                    if (failRead) throw new Error('private storage error');
                    return [sources.map(SourceMilestoneId => ({ SourceMilestoneId }))];
                }
                throw new Error('Unexpected SQL');
            },
            execute: async (sql: string, values: any[]) => {
                expect(events).toContain('source-check'); expect(events).not.toContain('unlock');
                expect(sql).toMatch(/^INSERT INTO Securities /);
                events.push('insert'); writes.push({ sql, values });
                if (failWrite) throw new Error('injected insert failure');
                await afterInsert?.();
                return [{ insertId: 7 }];
            },
            beginTransaction: async () => { events.push('begin'); snapshot = [...writes]; },
            commit: async () => { events.push('commit'); if (failCommit) throw new Error('synthetic commit failure'); },
            rollback: async () => { events.push('rollback'); writes = snapshot; },
            release: () => { events.push('release'); }, destroy: () => { events.push('destroy'); },
        };
    });
    jest.spyOn(CaseTypes, 'find').mockImplementation(async () => {
        events.push('type-read'); return [{ id: 1 }] as any;
    });
    jest.spyOn(Milestones, 'find').mockImplementation(async conditions => {
        events.push('milestone-read'); expect(conditions?.[0].contractId).toBe(77);
        return [{ id: 120 }] as any;
    });
    // Keep the real Cases.add and its guard. Replace only the already-covered
    // case creation workflow (DB/Drive/Scrum) beneath that boundary.
    jest.spyOn(Cases as any, 'addUnlocked').mockImplementation(async (...args: any[]) => {
        events.push('case-effects');
        if (failCase) throw new Error('injected case failure');
        const caseItem = args[0]; caseItem.id = 20;
        afterCase?.();
        return { caseItem };
    });
});

it.each(['model', 'DTO'])('refuses source creation before effects for %s', async mode => {
    sources = [120];
    await expect(mode === 'model' ? Controller.add(new Security(dto())) : Controller.addFromDto(dto()))
        .rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events).not.toContain('case-effects'); expect(writes).toEqual([]);
    expect(events.indexOf('rollback')).toBeLessThan(events.indexOf('unlock'));
});
it.each(['model', 'DTO'])('keeps %s creation protected through commit and preserves values', async mode => {
    const result = await (mode === 'model' ? Controller.add(new Security(dto())) : Controller.addFromDto(dto()));
    expect(events[0]).toBe('lock');
    expect(events.filter(event => event === 'lock')).toHaveLength(1);
    expect(events.indexOf('commit')).toBeLessThan(events.indexOf('unlock'));
    expect(writes).toHaveLength(1); expect(result.id).toBe(7); expect(result.caseId).toBe(20);
    expect(result).toMatchObject({ contractId: 77, value: 1000, returnedValue: 100, deductionValue: 25 });
    expect(writes[0].sql).toContain('CaseId'); expect(writes[0].values).toContain(20);
    expect(writes[0].values).not.toContain(999);
});
it.each(['read', 'case', 'insert', 'commit'])('holds the lock through confirmed rollback after %s failure', async phase => {
    failRead = phase === 'read'; failCase = phase === 'case';
    failWrite = phase === 'insert'; failCommit = phase === 'commit';
    await expect(Controller.addFromDto(dto())).rejects.toThrow();
    expect(writes).toEqual([]);
    expect(events.indexOf('rollback')).toBeGreaterThan(-1);
    expect(events.indexOf('rollback')).toBeLessThan(events.indexOf('unlock'));
    expect(events.filter(event => event === 'unlock')).toHaveLength(1);
    // This only proves release, not idempotent retry of partial case creation.
    await Lifecycle.run(async () => { events.push('next-owner'); });
    expect(events).toContain('next-owner');
});
it('queues consolidation launched after case creation until security commit', async () => {
    afterInsert = async () => {
        await new Promise(resolve => setImmediate(resolve));
        expect(events).not.toContain('batch');
    };
    // A timer created outside ownership gives the second request its own context.
    let launch!: () => void;
    const launchReady = new Promise<void>(resolve => { launch = resolve; });
    const batchRequest = launchReady.then(() => Lifecycle.transaction(async () => { events.push('batch'); }));
    afterCase = launch;
    await Controller.addFromDto(dto()); await batchRequest;
    expect(events.indexOf('batch')).toBeGreaterThan(events.indexOf('commit'));
    expect(writes).toHaveLength(1);
});
it('waits for a prior batch and then refuses its fresh source state', async () => {
    let enter!: () => void, resume!: () => void;
    const ready = new Promise<void>(resolve => { enter = resolve; });
    const hold = new Promise<void>(resolve => { resume = resolve; });
    const batch = Lifecycle.transaction(async () => { enter(); await hold; sources = [120]; });
    await ready;
    const refused = expect(Controller.addFromDto(dto())).rejects.toMatchObject({ code: 'OPERATION_IN_PROGRESS' });
    expect(events).not.toContain('milestone-read'); resume(); await batch; await refused;
    expect(events).not.toContain('case-effects'); expect(writes).toEqual([]);
});
it('rejects creation nested in a lifecycle transaction before effects', async () => {
    await expect(Lifecycle.transaction(() => Controller.addFromDto(dto())))
        .rejects.toMatchObject({ code: 'NESTED_LIFECYCLE_WRITE' });
    expect(events).not.toContain('milestone-read'); expect(writes).toEqual([]);
});
