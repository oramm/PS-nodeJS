jest.mock('../../../tools/ToolsDb');

import ToolsDb from '../../../tools/ToolsDb';
import Setup from '../../../setup/Setup';
import ContractsController from '../../ContractsController';
import ContractRepository from '../../ContractRepository';
import ContractEntityController from '../../ContractEntityController';
import ProjectRepository from '../../../projects/ProjectRepository';
import MilestonesController from '../../milestones/MilestonesController';
import MilestoneRepository from '../../milestones/MilestoneRepository';
import CasesController from '../../milestones/cases/CasesController';
import CaseRepository from '../../milestones/cases/CaseRepository';
import CaseTypesController from '../../milestones/cases/caseTypes/CaseTypesController';
import CaseTypeRepository from '../../milestones/cases/caseTypes/CaseTypeRepository';
import MilestoneTypesController from '../../milestones/milestoneTypes/MilestoneTypesController';
import MilestoneTypeRepository from '../../milestones/milestoneTypes/MilestoneTypeRepository';
import {
    enqueueFidmanContractPush, enqueueFidmanFoldersForContracts,
    deliverFidmanFoldersAfterCommit, retryOrPushFidmanContract,
} from '../FidmanSync';

const auth = {} as any;
let committed: boolean;
let writes: { kind: string; refId: number; payload: any }[];
let contracts: Map<number, any>;
let milestones: Map<number, any>;
let cases: Map<number, any>;
let conn: any;
let operations: string[];

function milestone(id = 10, contractId = 42, typeId = 50): any {
    return {
        id, contractId, typeId, gdFolderId: 'folder_milestone', _dates: [{}],
        _contract: { id: contractId }, _type: { id: typeId },
        updateFolderName: jest.fn(async () => true),
        deleteFolder: jest.fn(async () => {}), deleteFromScrum: jest.fn(async () => {}),
        editInScrum: jest.fn(async () => {}),
    };
}

function caseItem(id = 7, milestoneId = 10): any {
    return {
        id, milestoneId, typeId: 75, gdFolderId: 'folder_case_7',
        _parent: milestones.get(milestoneId), _type: {},
        createFolder: jest.fn(async () => {}), editFolder: jest.fn(async () => {}),
        setDisplayNumber: jest.fn(), deleteFolder: jest.fn(async () => {}),
        editInScrum: jest.fn(async () => {}), deleteFromScrumSheet: jest.fn(async () => {}),
    };
}

beforeEach(() => {
    committed = false;
    operations = [];
    writes = [];
    contracts = new Map([42, 43].map((id) => [id, {
        TypeId: 3, FidmanSyncEnabled: 1, GdFolderId: `folder_contract_${id}`,
    }]));
    milestones = new Map([[10, milestone()], [11, milestone(11, 43)]]);
    cases = new Map([[7, caseItem()]]);
    jest.spyOn(Setup, 'FidmanSync', 'get').mockReturnValue({ ...Setup.FidmanSync, contractTypeIds: [3, 4] });
    conn = {
        query: jest.fn(async (sql: string, params: any[]) => {
            operations.push(sql === 'SELECT Id FROM Contracts WHERE Id = ? FOR UPDATE'
                ? `lock:${params[0]}` : `query:${sql}`);
            if (sql.includes('SELECT DISTINCT m.ContractId')) {
                const ids = sql.includes('SELECT MilestoneId FROM Cases')
                    ? [...params.slice(0, -1), cases.get(params[params.length - 1])?.milestoneId]
                    : params;
                return [[...new Set(ids.map((id) => milestones.get(id)?.contractId))]
                    .filter((id) => id != null).map((ContractId) => ({ ContractId }))];
            }
            if (sql.includes('FROM Contracts')) return [[contracts.get(params[0])].filter(Boolean)];
            if (sql.includes('FROM Cases c JOIN Milestones')) return [[...cases.values()]
                .filter((c) => milestones.get(c.milestoneId)?.contractId === params[0] &&
                    milestones.get(c.milestoneId)?.typeId === 50)
                .map((c) => ({ Id: c.id, TypeId: c.typeId, GdFolderId: c.gdFolderId }))];
            return [[]]; // brak wcześniejszej migawki oraz personelu
        }),
        execute: jest.fn(async (sql: string, params: any[]) => {
            expect(committed).toBe(false);
            operations.push(`execute:${sql}`);
            if (sql.startsWith('INSERT')) {
                writes.push({ kind: params[0], refId: params[1], payload: JSON.parse(params[2]) });
                return [{ insertId: writes.length }];
            }
            return [{ affectedRows: 0 }];
        }),
        beginTransaction: jest.fn(async () => { committed = false; }),
        commit: jest.fn(async () => { committed = true; }),
        rollback: jest.fn(async () => {}), release: jest.fn(),
    };
    (ToolsDb.transaction as any).mockImplementation(async (callback: any, external?: any) => {
        if (!external) committed = false;
        const result = await callback(external || conn);
        if (!external) await conn.commit();
        return result;
    });
    (ToolsDb.getPoolConnectionWithTimeout as any).mockResolvedValue(conn);
    (ToolsDb.getQueryCallbackAsync as any).mockImplementation(async () => {
        expect(committed).toBe(true);
        return []; // odczyt dostawy, bez transportu HTTP
    });
    jest.spyOn(MilestoneRepository.prototype, 'findById').mockImplementation(async (id) => milestones.get(id));
    const milestoneRepo = (MilestonesController as any).getInstance().repository;
    jest.spyOn(milestoneRepo, 'addMilestonesWithDates').mockImplementation(async (items: any, tx: any) => {
        expect(tx).toBe(conn);
        operations.push('save:milestone');
        items.forEach((m: any) => milestones.set(m.id, m));
        return items;
    });
    jest.spyOn(milestoneRepo, 'editMilestoneWithDates').mockImplementation(async (item: any, tx: any) => {
        expect(tx).toBe(conn);
        operations.push('save:milestone');
        milestones.set(item.id, item); return item;
    });
    jest.spyOn(milestoneRepo, 'deleteFromDb').mockImplementation(async (item: any) => {
        milestones.delete(item.id);
        for (const c of cases.values()) if (c.milestoneId === item.id) cases.delete(c.id);
    });
    const saveCase = async (item: any, ...args: any[]) => {
        expect(args).toContain(conn);
        operations.push('save:case'); cases.set(item.id, item); return item;
    };
    jest.spyOn(CaseRepository.prototype, 'addWithRelated').mockImplementation(saveCase);
    jest.spyOn(CaseRepository.prototype, 'editWithRelated').mockImplementation(saveCase);
    jest.spyOn(CaseRepository.prototype, 'deleteFromDb').mockImplementation(async (item: any, tx: any) => {
        expect(tx).toBe(conn); operations.push('save:case'); cases.delete(item.id);
    });
    // SPR-P: wysyłka umowy dociąga projekt; poza zakresem testów folderów i blokad.
    jest.spyOn(ProjectRepository.prototype, 'findForContract')
        .mockResolvedValue({ id: 1, ourId: 'PRJ.1', name: 'Projekt' } as any);
    jest.spyOn(CaseRepository.prototype, 'findSubCaseIds').mockResolvedValue([]);
    jest.spyOn(CaseRepository.prototype, 'countCasesWithGdFolder').mockResolvedValue(0);
    jest.spyOn(CasesController, 'prepareProcessInstances').mockResolvedValue([]);
    jest.spyOn(CasesController, 'prepareDefaultTasks').mockResolvedValue([]);
    jest.spyOn(CasesController, 'addInScrum').mockResolvedValue(undefined);
    jest.spyOn(MilestonesController, 'createFolders').mockResolvedValue({} as any);
    jest.spyOn(MilestonesController, 'createDefaultCases').mockResolvedValue(undefined);
});

const folderWrites = () => writes.filter((w) => w.kind === 'contract.folders');

it('F3 przeniesienie sprawy podczas oczekiwania odświeża ponownie odczytanego właściciela', async () => {
    contracts.set(44, { ...contracts.get(42) });
    milestones.set(12, milestone(12, 44));
    const query = conn.query.getMockImplementation();
    let moved = false;
    conn.query.mockImplementation(async (sql: string, params: any[]) => {
        if (!moved && sql === 'SELECT Id FROM Contracts WHERE Id = ? FOR UPDATE' && params[0] === 42) {
            cases.set(7, caseItem(7, 12));
            moved = true;
        }
        return query(sql, params);
    });
    await CasesController.edit(caseItem(7, 11), auth, ['milestoneId']);
    expectLocksBeforeSave([42, 43, 44], 'save:case');
    expect(conn.query.mock.calls.some(([sql]: [string]) =>
        sql.includes('SELECT MilestoneId FROM Cases WHERE Id = ? FOR UPDATE)') &&
        sql.trimEnd().endsWith('FOR UPDATE'))).toBe(true);
    expect(folderWrites().map((w) => [w.refId, w.payload.cases.map((c: any) => c.psCaseId)]))
        .toEqual([[42, []], [43, [7]], [44, []]]);
});

it('F4 przeniesienie kamienia odświeża starą i docelową umowę', async () => {
    await MilestonesController.edit(milestone(10, 43), auth, undefined, ['contractId']);
    expectLocksBeforeSave([42, 43], 'save:milestone');
    expect(folderWrites().map((w) => [w.refId, w.payload.cases.map((c: any) => c.psCaseId)]))
        .toEqual([[42, []], [43, [7]]]);
});

it('F4 usunięcie kamienia bierze właściciela z bazy zamiast nieaktualnego DTO', async () => {
    await MilestonesController.delete(milestone(10, 43), auth);
    expect(folderWrites().map((w) => [w.refId, w.payload.cases])).toEqual([[42, []]]);
});

it('F5 kompensacja po błędzie folderu odkłada komplet bez wcześniej dodanych spraw', async () => {
    cases.clear();
    (MilestonesController.createDefaultCases as jest.Mock).mockImplementation(async () => {
        await CasesController.addBulkWithDefaultTasks([caseItem()], auth);
    });
    const item = milestones.get(10);
    item.updateFolderName.mockRejectedValue(new Error('folder failed'));
    await expect(MilestonesController.add(item, auth)).rejects.toThrow('folder failed');
    expect(milestones.has(10)).toBe(false);
    expect(folderWrites().map((w) => w.payload.cases.map((c: any) => c.psCaseId)))
        .toEqual([[], [7], []]);
});

it.each(['case', 'milestone'] as const)('F2 kaskadowe usunięcie rodzaju %s odświeża dotknięte umowy', async (kind) => {
    cases.set(8, caseItem(8, 11));
    const typeId = kind === 'case' ? 75 : 50;
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockImplementation(async (sql: string, _tx, params) => {
        if (!sql.includes('SELECT DISTINCT m.ContractId')) return [];
        expect(params).toEqual([typeId]);
        expect(sql).toContain('m.TypeId = 50');
        expect(sql).toContain(kind === 'case' ? 'c.TypeId = ?' : 'm.TypeId = ?');
        return [...new Set([...cases.values()].filter((c) => {
            const m = milestones.get(c.milestoneId);
            return m?.typeId === 50 && (kind === 'case' ? c.typeId === typeId : m.typeId === typeId);
        }).map((c) => milestones.get(c.milestoneId).contractId))].map((ContractId) => ({ ContractId }));
    });
    const repo = kind === 'case' ? CaseTypeRepository.prototype : MilestoneTypeRepository.prototype;
    jest.spyOn(repo, 'deleteFromDb').mockImplementation(async () => {
        expect(folderWrites()).toEqual([]);
        for (const c of cases.values()) if (kind === 'case' ? c.typeId === typeId :
            milestones.get(c.milestoneId)?.typeId === typeId) cases.delete(c.id);
        if (kind === 'milestone') for (const m of milestones.values()) if (m.typeId === typeId) milestones.delete(m.id);
    });
    if (kind === 'case') await CaseTypesController.delete({ id: typeId } as any);
    else await MilestoneTypesController.delete({ id: typeId } as any);
    expect(folderWrites().map((w) => [w.refId, w.payload.cases])).toEqual([[42, []], [43, []]]);
});

it('F6 trasa sprawy kończy zapis PENDING zanim wisząca dostawa HTTP się zakończy', async () => {
    jest.spyOn(Setup, 'FidmanSync', 'get').mockReturnValue({ ...Setup.FidmanSync,
        baseUrl: 'http://fidman.test', token: 'test' });
    const row = { Id: 1, Kind: 'contract.folders', RefId: 42, Payload: {}, Status: 'PENDING', Attempts: 0 };
    (ToolsDb.getQueryCallbackAsync as jest.Mock).mockResolvedValue([row]);
    const query = conn.query.getMockImplementation();
    conn.query.mockImplementation(async (sql: string, params: any[]) => {
        if (sql.includes('GET_LOCK')) return [[{ Acquired: 1 }]];
        if (sql.includes('NOT EXISTS')) return [[row]];
        return query(sql, params);
    });
    let finish!: (response: any) => void;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => { started = resolve; });
    jest.spyOn(global, 'fetch').mockImplementation(() => {
        started(); return new Promise((resolve) => { finish = resolve; });
    });
    const route = CasesController.edit(caseItem(), auth, ['status']);
    await pending;
    const result = await Promise.race([route.then(() => 'saved'),
        new Promise<string>((resolve) => setTimeout(() => resolve('waiting'), 50))]);
    expect(committed).toBe(true);
    expect(folderWrites()).toHaveLength(1);
    expect(row.Status).toBe('PENDING');
    finish({ status: 200, json: async () => ({}) });
    await route;
    expect(result).toBe('saved');
});

const scopes = [
    ['w zakresie', 3, 1, 1], ['wyłączona', 3, 0, 0], ['typ poza zakresem', 99, 1, 0],
] as const;

describe.each(scopes)('LMF-3 umowa %s', (_label, TypeId, FidmanSyncEnabled, count) => {
    it('contract.upsert odkłada foldery w transakcji i dostarcza po commicie', async () => {
        contracts.set(42, { ...contracts.get(42), TypeId, FidmanSyncEnabled });
        const ids: number[] = [];
        await ToolsDb.transaction(async (tx) => enqueueFidmanContractPush({ id: 42 } as any, tx, ids));
        await deliverFidmanFoldersAfterCommit(ids);
        expect(folderWrites()).toHaveLength(count);
        expect(ToolsDb.getQueryCallbackAsync).toHaveBeenCalledTimes(count);
    });
});

const milestoneRoutes = ['add', 'addBulkWithDates', 'addBulkWithDatesAndCases', 'edit', 'editFolder', 'delete'] as const;
describe.each(scopes)('LMF-3 kamień umowy %s', (_label, TypeId, FidmanSyncEnabled, count) => {
    it.each(milestoneRoutes)('%s odkłada wpis folderów; usunięcie daje pustą listę spraw', async (route) => {
        contracts.set(42, { ...contracts.get(42), TypeId, FidmanSyncEnabled });
        const item = milestones.get(10);
        if (route === 'addBulkWithDates') await MilestonesController.addBulkWithDates([item]);
        else if (route === 'addBulkWithDatesAndCases') await MilestonesController.addBulkWithDatesAndCases([item], auth);
        else if (route === 'edit') await MilestonesController.edit(item, auth, undefined, ['status']);
        else await (MilestonesController[route] as any)(item, auth);
        expect(folderWrites()).toHaveLength(count);
        if (count && route === 'delete') expect(folderWrites()[0].payload.cases).toEqual([]);
        expect(ToolsDb.getQueryCallbackAsync).toHaveBeenCalledTimes(count);
    });
});

const caseRoutes = ['add', 'addBulkWithDefaultTasks', 'edit', 'delete'] as const;
describe.each(scopes)('LMF-3 sprawa umowy %s', (_label, TypeId, FidmanSyncEnabled, count) => {
    it.each(caseRoutes)('%s odkłada foldery w transakcji i dostarcza po commicie', async (route) => {
        contracts.set(42, { ...contracts.get(42), TypeId, FidmanSyncEnabled });
        const item = caseItem();
        if (route === 'addBulkWithDefaultTasks') await CasesController.addBulkWithDefaultTasks([item], auth);
        else if (route === 'edit') await CasesController.edit(item, auth, ['status']);
        else await CasesController[route](item, auth);
        expect(folderWrites()).toHaveLength(count);
        expect(ToolsDb.getQueryCallbackAsync).toHaveBeenCalledTimes(count);
    });
});

it('LMF-3 przeniesienie sprawy między umowami odkłada oba komplety', async () => {
    await CasesController.edit(caseItem(7, 11), auth);
    expect(folderWrites().map((w) => w.refId)).toEqual([42, 43]);
    expect(folderWrites()[0].payload.cases).toEqual([]);
    expect(folderWrites()[1].payload.cases[0].psCaseId).toBe(7);
});

it('LMF-3 zmiana rodzaju kamienia z 50 czyści listę spraw', async () => {
    await MilestonesController.edit(milestone(10, 42, 51), auth, undefined, ['typeId']);
    expect(folderWrites()[0].payload.cases).toEqual([]);
});

it.each(['enqueue', 'delivery'])('LMF-3 błąd %s po zapisie nie wywraca usunięcia kamienia', async (failure) => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    if (failure === 'enqueue') conn.execute.mockRejectedValue(new Error('enqueue failed'));
    else (ToolsDb.getQueryCallbackAsync as any).mockRejectedValue(new Error('delivery failed'));
    await expect(MilestonesController.delete(milestones.get(10), auth)).resolves.toBeUndefined();
    expect(milestones.has(10)).toBe(false);
    expect(console.error).toHaveBeenCalled();
});

it('LMF-3 błąd odkładania sprawy propaguje wyjątek i nie wywołuje commit', async () => {
    conn.execute.mockRejectedValue(new Error('enqueue failed'));
    await expect(CasesController.edit(caseItem(), auth, ['status'])).rejects.toThrow('enqueue failed');
    expect(conn.commit).not.toHaveBeenCalled();
    expect(ToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
});

it('LMF-3 zewnętrzna transakcja kamieni nie dostarcza przed commitem właściciela', async () => {
    await MilestonesController.addBulkWithDates([milestones.get(10)], conn);
    expect(folderWrites()).toHaveLength(1);
    expect(conn.commit).not.toHaveBeenCalled();
    expect(ToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
});

it('LMF-3 powtórzone identyfikatory umów są deduplikowane i sortowane', async () => {
    await ToolsDb.transaction(async (tx) => enqueueFidmanFoldersForContracts([43, 42, 42, undefined], tx));
    expect(folderWrites().map((w) => w.refId)).toEqual([42, 43]);
});

it.each([true, false])('LMF-3 dopchnięcie (ponowiono upsert: %s) odkłada bieżące foldery', async (retry) => {
    // Próba dostawy upsert jest wyłączona konfiguracją; sprawdzamy obie gałęzie akcji.
    jest.spyOn(Setup, 'FidmanSync', 'get').mockReturnValue({ ...Setup.FidmanSync, baseUrl: '', token: '' });
    (ToolsDb.getQueryCallbackAsync as any).mockImplementation(async (sql: string) => {
        if (sql.includes("Status IN ('FAILED', 'SKIPPED')")) return retry
            ? [{ Id: 99, Status: 'FAILED', Kind: 'contract.upsert', Attempts: 0, Payload: {} }] : [];
        if (sql.includes('WHERE Id = ?')) expect(committed).toBe(true);
        return [];
    });
    await retryOrPushFidmanContract({ id: 42, typeId: 3, fidmanSyncEnabled: true } as any);
    expect(folderWrites()).toHaveLength(1);
});

it.each([true, false])('LMF-3 dopchnięcie (retry: %s) wymusza komplet mimo identycznego SENT, zwykły zapis nie', async (retry) => {
    jest.spyOn(Setup, 'FidmanSync', 'get').mockReturnValue({ ...Setup.FidmanSync, baseUrl: '', token: '' });
    (ToolsDb.getQueryCallbackAsync as any).mockImplementation(async (sql: string) =>
        sql.includes("Status IN ('FAILED', 'SKIPPED')") && retry
            ? [{ Id: 99, Status: 'FAILED', Kind: 'contract.upsert', Attempts: 0, Payload: {} }] : []);
    const base = conn.query.getMockImplementation();
    const snapshot = { legacyContractId: 42, contractFolderId: 'folder_contract_42',
        cases: [{ psCaseId: 7, psCaseTypeId: 75, folderId: 'folder_case_7' }] };
    conn.query.mockImplementation(async (sql: string, params: any[]) =>
        sql.includes("Kind = 'contract.folders'") ? [[{ Payload: snapshot, Status: 'SENT' }]] : base(sql, params));
    await ToolsDb.transaction(async (tx) => enqueueFidmanFoldersForContracts([42], tx));
    expect(folderWrites()).toHaveLength(0);
    await retryOrPushFidmanContract({ id: 42, typeId: 3, fidmanSyncEnabled: true } as any);
    expect(folderWrites()).toHaveLength(1);
});

it('LMF-3 addBulkWithDatesAndCases odkłada sprawy dodane przez atrapę createDefaultCases', async () => {
    cases.clear();
    (MilestonesController.createDefaultCases as any).mockImplementation(async () => {
        await CasesController.addBulkWithDefaultTasks([caseItem()], auth);
    });
    await MilestonesController.addBulkWithDatesAndCases([milestones.get(10)], auth);
    expect(folderWrites().map((w) => w.payload.cases.map((c: any) => c.psCaseId))).toEqual([[], [7]]);
});

function expectLocksBeforeSave(ids: number[], save: string) {
    const firstSave = operations.findIndex((op) => op === save);
    expect(firstSave).toBeGreaterThanOrEqual(0);
    expect(operations.slice(0, firstSave).filter((op) => op.startsWith('lock:')))
        .toEqual(ids.map((id) => `lock:${id}`));
}

it.each(['add', 'addBulkWithDates', 'addBulkWithDatesAndCases', 'edit'] as const)(
    'LMF-3 blokady: kamień %s blokuje umowę przed zapisem', async (route) => {
        const item = milestones.get(10);
        if (route === 'addBulkWithDates') await MilestonesController.addBulkWithDates([item]);
        else if (route === 'addBulkWithDatesAndCases') await MilestonesController.addBulkWithDatesAndCases([item], auth);
        else if (route === 'edit') await MilestonesController.edit(item, auth, undefined, ['status']);
        else await MilestonesController.add(item, auth);
        expectLocksBeforeSave([42], 'save:milestone');
    }
);

it('LMF-3 blokady: zbiorczy zapis kamieni blokuje obie umowy rosnąco', async () => {
    await MilestonesController.addBulkWithDates([milestones.get(11), milestones.get(10)]);
    expectLocksBeforeSave([42, 43], 'save:milestone');
});

it.each(caseRoutes)('LMF-3 blokady: sprawa %s blokuje umowę przed zapisem', async (route) => {
    const item = caseItem();
    if (route === 'addBulkWithDefaultTasks') await CasesController.addBulkWithDefaultTasks([item], auth);
    else if (route === 'edit') await CasesController.edit(item, auth, ['status']);
    else await CasesController[route](item, auth);
    expectLocksBeforeSave([42], 'save:case');
});

it.each([[10, 11], [11, 10]])(
    'LMF-3 blokady: przeniesienie sprawy z kamienia %s do %s blokuje obie umowy rosnąco',
    async (from, to) => {
        cases.set(7, caseItem(7, from));
        await CasesController.edit(caseItem(7, to), auth, ['milestoneId']);
        expectLocksBeforeSave([42, 43], 'save:case');
    }
);

it('LMF-3 blokady: zbiorczy zapis spraw blokuje obie umowy rosnąco', async () => {
    await CasesController.addBulkWithDefaultTasks([caseItem(8, 11), caseItem(9, 10)], auth);
    expectLocksBeforeSave([42, 43], 'save:case');
});

it('LMF-3 blokady: edycja umowy blokuje ją przed pierwszym zapisem', async () => {
    jest.spyOn(ContractRepository.prototype, 'editInDb').mockImplementation(async (_item, tx) => {
        expect(tx).toBe(conn); operations.push('save:contract');
    });
    await ContractsController.edit({ id: 42, typeId: 3, fidmanSyncEnabled: true } as any, undefined, ['status']);
    expectLocksBeforeSave([42], 'save:contract');
});

it('LMF-3 blokady: nowa umowa jest pierwszym zapisywanym wierszem', async () => {
    jest.spyOn(ContractRepository.prototype, 'isUniquePerProject').mockResolvedValue(false);
    jest.spyOn(ContractRepository.prototype, 'addInDb').mockImplementation(async (item, tx) => {
        expect(tx).toBe(conn); operations.push('insert:contract'); item.id = 42;
    });
    jest.spyOn(ContractEntityController, 'addAssociations').mockImplementation(async (_item, tx) => {
        expect(tx).toBe(conn); operations.push('save:associations');
    });
    await ContractsController.add({ alias: 'TEST', typeId: 3, startDate: '2026-01-01', endDate: '2026-12-31' } as any);
    expect(operations[0]).toBe('insert:contract');
    expect(operations[1]).toBe('save:associations');
    expect(operations[2]).toBe('lock:42');
});

it.each([true, false])('LMF-3 blokady: dopchnięcie (retry: %s) blokuje umowę przed wpisem kolejki', async (retry) => {
    jest.spyOn(Setup, 'FidmanSync', 'get').mockReturnValue({ ...Setup.FidmanSync, baseUrl: '', token: '' });
    (ToolsDb.getQueryCallbackAsync as any).mockImplementation(async (sql: string) =>
        sql.includes("Status IN ('FAILED', 'SKIPPED')") && retry
            ? [{ Id: 99, Status: 'FAILED', Kind: 'contract.upsert', Attempts: 0, Payload: {} }] : []);
    await retryOrPushFidmanContract({ id: 42, typeId: 3, fidmanSyncEnabled: true } as any);
    expect(operations[0]).toBe('lock:42');
    expect(operations.findIndex((op) => op.startsWith('execute:'))).toBeGreaterThan(0);
});
