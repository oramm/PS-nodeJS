/**
 * WYK-1 — zakres projektu wynika ze znacznika przy umowach (Q-WYK-2 = A).
 * Plan: 20_projects/Aplikacje/PS.APP.01/plans/2026-08-23-wyk-wykluczenia-synchronizacji-plan.md
 *
 * Projekt nie ma i nie będzie miał własnego znacznika. Do FIDmana idzie wtedy i tylko wtedy,
 * gdy ma co najmniej jedną umowę objętą synchronizacją. Kryterium odbioru brzmi: edycja
 * projektu, którego WSZYSTKIE umowy są wykluczone, nie tworzy wiersza w kolejce wysyłkowej.
 *
 * Inaczej niż ./ProjectsController.fidmanSync.test.ts (który mockuje `projectHasSyncedContract`,
 * bo sprawdza okablowanie), tutaj ta funkcja jest PRAWDZIWA, a połączenie odpowiada na jej
 * zapytanie z małej tabeli umów trzymanej w pamięci. Atrapa stosuje warunek znacznika tylko
 * wtedy, gdy zapytanie o niego PYTA — dzięki temu usunięcie `AND c.FidmanSyncEnabled = 1`
 * z FidmanSync.ts zapala pierwszy test zamiast przejść niezauważone.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../tools/ToolsDb');
jest.mock('../ProjectEntitiesController');
// FidmanSync celowo NIEZAMOCKOWANY — o jego zapytanie w tym pliku chodzi.

import ToolsDb from '../../tools/ToolsDb';
import ProjectEntitiesController from '../ProjectEntitiesController';
import ProjectsController from '../ProjectsController';

type ContractRow = {
    ProjectOurId: string;
    TypeId: number;
    FidmanSyncEnabled: 0 | 1;
};

describe('ProjectsController.edit() — WYK-1: zakres projektu ze znacznika przy umowach', () => {
    let mockConn: any;
    let contractsTable: ContractRow[];
    let outboxInserts: string[];
    const fakeAuth = {} as any;

    beforeEach(() => {
        jest.clearAllMocks();
        outboxInserts = [];
        process.env.FIDMAN_SYNC_CONTRACT_TYPE_IDS = '3,4';

        mockConn = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
            // Atrapa tabeli Contracts dla zapytania bramkującego z projectHasSyncedContract().
            query: jest.fn(async (sql: any, params: any) => {
                const text = String(sql);
                const [projectOurId, ...typeIds] = params as any[];
                const pytaOZnacznik = /FidmanSyncEnabled\s*=\s*1/.test(text);
                const rows = contractsTable.filter(
                    (c) =>
                        c.ProjectOurId === projectOurId &&
                        typeIds.includes(c.TypeId) &&
                        (!pytaOZnacznik || c.FidmanSyncEnabled === 1)
                );
                return [rows.map(() => ({ '1': 1 })), undefined];
            }),
            // Wejście do kolejki wysyłkowej — jedyne, co ten test liczy.
            execute: jest.fn(async (sql: any) => {
                if (String(sql).includes('INSERT INTO FidmanSyncOutbox'))
                    outboxInserts.push(String(sql));
                return [{ insertId: 555 }, undefined];
            }),
        };

        (ToolsDb.transaction as jest.Mock).mockImplementation(
            async (cb: any) => {
                await mockConn.beginTransaction();
                try {
                    const result = await cb(mockConn);
                    await mockConn.commit();
                    return result;
                } catch (e) {
                    await mockConn.rollback();
                    throw e;
                }
            }
        );
        (ToolsDb.editInDb as any).mockResolvedValue(undefined);
        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([]);
        (ToolsDb.executeSQL as any).mockResolvedValue({});
        (ProjectEntitiesController.deleteByProjectId as any).mockResolvedValue(
            undefined
        );
        // Dostawa post-commit nie jest przedmiotem tego testu; bez adresu FIDmana
        // realny deliverOutboxRow zapisuje FAILED i nie wychodzi na sieć.
        delete process.env.FIDMAN_SYNC_BASE_URL;
    });

    const makeProject = () =>
        ({
            id: 5,
            ourId: 'PRJ-001',
            name: 'Projekt',
            comment: 'opis',
            editProjectFolder: jest.fn(() => Promise.resolve(undefined)),
        }) as any;

    it('edycja projektu, którego WSZYSTKIE umowy są wykluczone, nie tworzy wiersza w kolejce wysyłkowej', async () => {
        contractsTable = [
            { ProjectOurId: 'PRJ-001', TypeId: 3, FidmanSyncEnabled: 0 },
            { ProjectOurId: 'PRJ-001', TypeId: 4, FidmanSyncEnabled: 0 },
        ];

        await ProjectsController.edit(makeProject(), fakeAuth);

        expect(mockConn.query).toHaveBeenCalled();
        expect(outboxInserts).toHaveLength(0);
    });

    it('KONTROLA POZYTYWNA: projekt z choćby jedną umową objętą synchronizacją tworzy wiersz w kolejce', async () => {
        contractsTable = [
            { ProjectOurId: 'PRJ-001', TypeId: 3, FidmanSyncEnabled: 0 },
            { ProjectOurId: 'PRJ-001', TypeId: 4, FidmanSyncEnabled: 1 },
        ];

        await ProjectsController.edit(makeProject(), fakeAuth);

        expect(outboxInserts).toHaveLength(1);
    });

    it('umowa ze znacznikiem, ale typu spoza allowlisty, nie wciąga projektu do synchronizacji', async () => {
        contractsTable = [
            { ProjectOurId: 'PRJ-001', TypeId: 5, FidmanSyncEnabled: 1 },
        ];

        await ProjectsController.edit(makeProject(), fakeAuth);

        expect(outboxInserts).toHaveLength(0);
    });
});
