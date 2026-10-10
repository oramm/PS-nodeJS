jest.mock('../../../tools/ToolsDb');

import ToolsDb from '../../../tools/ToolsDb';
import Setup from '../../../setup/Setup';
import MilestonesController from '../../milestones/MilestonesController';
import MilestoneRepository from '../../milestones/MilestoneRepository';
import CasesController from '../../milestones/cases/CasesController';
import CaseRepository from '../../milestones/cases/CaseRepository';
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
    writes = [];
    contracts = new Map([42, 43].map((id) => [id, {
        TypeId: 3, FidmanSyncEnabled: 1, GdFolderId: `folder_contract_${id}`,
    }]));
    milestones = new Map([[10, milestone()], [11, milestone(11, 43)]]);
    cases = new Map([[7, caseItem()]]);
    jest.spyOn(Setup, 'FidmanSync', 'get').mockReturnValue({ ...Setup.FidmanSync, contractTypeIds: [3, 4] });
    conn = {
        query: jest.fn(async (sql: string, params: any[]) => {
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
    jest.spyOn(milestoneRepo, 'addMilestonesWithDates').mockImplementation(async (items: any) => {
        items.forEach((m: any) => milestones.set(m.id, m));
        return items;
    });
    jest.spyOn(milestoneRepo, 'editMilestoneWithDates').mockImplementation(async (item: any) => {
        milestones.set(item.id, item); return item;
    });
    jest.spyOn(milestoneRepo, 'deleteFromDb').mockImplementation(async (item: any) => {
        milestones.delete(item.id);
        for (const c of cases.values()) if (c.milestoneId === item.id) cases.delete(c.id);
    });
    const saveCase = async (item: any) => { cases.set(item.id, item); return item; };
    jest.spyOn(CaseRepository.prototype, 'addWithRelated').mockImplementation(saveCase);
    jest.spyOn(CaseRepository.prototype, 'editWithRelated').mockImplementation(saveCase);
    jest.spyOn(CaseRepository.prototype, 'deleteFromDb').mockImplementation(async (item: any) => { cases.delete(item.id); });
    jest.spyOn(CaseRepository.prototype, 'findSubCaseIds').mockResolvedValue([]);
    jest.spyOn(CaseRepository.prototype, 'countCasesWithGdFolder').mockResolvedValue(0);
    jest.spyOn(CasesController, 'prepareProcessInstances').mockResolvedValue([]);
    jest.spyOn(CasesController, 'prepareDefaultTasks').mockResolvedValue([]);
    jest.spyOn(CasesController, 'addInScrum').mockResolvedValue(undefined);
    jest.spyOn(MilestonesController, 'createFolders').mockResolvedValue({} as any);
    jest.spyOn(MilestonesController, 'createDefaultCases').mockResolvedValue(undefined);
});

const folderWrites = () => writes.filter((w) => w.kind === 'contract.folders');
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
    it.each(milestoneRoutes)('%s odkłada pełną migawkę bez filtrowania wyzwalacza', async (route) => {
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

it('LMF-3 błąd odkładania w transakcji sprawy przerywa zapis', async () => {
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

it('LMF-3 wiele zmian tej samej umowy odkłada jeden komplet', async () => {
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


it('LMF-3 po kamieniach domyślnych powstaje migawka z nowymi sprawami', async () => {
    cases.clear();
    (MilestonesController.createDefaultCases as any).mockImplementation(async () => {
        await CasesController.addBulkWithDefaultTasks([caseItem()], auth);
    });
    await MilestonesController.addBulkWithDatesAndCases([milestones.get(10)], auth);
    expect(folderWrites().map((w) => w.payload.cases.map((c: any) => c.psCaseId))).toEqual([[], [7]]);
});
