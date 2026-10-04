/**
 * CHT-3: pokoje Google Chat kontraktu ENVI (tworzenie, podpinanie, odpinanie, odmowy).
 * Baza jest atrapą na poziomie ToolsDb (SQL przechodzi przez prawdziwe repozytorium),
 * Google (ToolsChat) mockowany. Żadne zaproszenie nigdzie nie wychodzi.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../../../tools/ToolsDb');
jest.mock('../../../setup/Sessions/ToolsChat');

import ToolsDb from '../../../tools/ToolsDb';
import ToolsChat from '../../../setup/Sessions/ToolsChat';
import ChatSpacesController, {
    ChatSpaceError,
} from '../ChatSpacesController';

type SpaceRow = {
    Id: number;
    GoogleName: string;
    DisplayName: string;
    Uri: string | null;
    ProjectOurId: string | null;
    CreatedAt: string;
    CreatedByPersonId: number | null;
};

let contract: any;
let spaces: SpaceRow[];
let persons: Record<number, { account?: string | null; legacy?: string | null; personal?: string; active?: boolean }>;
let nextSpaceId: number;
let insertedSql: string[];

function resetDb() {
    contract = {
        Id: 100,
        Name: 'Nadzór nad budową oczyszczalni',
        Alias: 'OŚ',
        ProjectOurId: 'PRU.PT.00',
        ChatSpaceId: null,
        ProjectAlias: 'Prudnik',
        ProjectName: 'Projekt Prudnik',
        OurId: 'PRU.PT.03',
        ManagerId: 1,
        AdminId: 2,
    };
    spaces = [];
    persons = {
        1: { account: 'kierownik@envi.com.pl', personal: 'k@gmail.com' },
        2: { account: null, legacy: 'admin@envi.com.pl' }, // zaszla kolumna Persons.SystemEmail: ignorowana
        5: { account: 'nieaktywny@envi.com.pl', active: false },
        3: { account: 'Kierownik@envi.com.pl' }, // ten sam adres co 1 (inna wielkość liter)
        4: { account: '  ', legacy: null }, // brak adresu
    };
    nextSpaceId = 10;
    insertedSql = [];

    (ToolsDb.getQueryCallbackAsync as jest.Mock<any>).mockImplementation(
        async (sql: any) => {
            const text = String(sql);
            if (text.includes('FROM Contracts'))
                return contract ? [contract] : [];
            if (text.includes('FROM PersonAccounts')) {
                const ids = (text.match(/IN \(([\d, ]+)\)/)?.[1] || '')
                    .split(',')
                    .map((s) => Number(s.trim()));
                return ids
                    .filter(
                        (id) => persons[id] && persons[id].active !== false
                    )
                    .map((id) => ({
                        Id: id,
                        Email: (persons[id].account || '').trim() || null,
                    }));
            }
            if (text.includes('FROM ChatSpaces WHERE Id')) {
                const id = Number(text.match(/Id = (\d+)/)?.[1]);
                return spaces.filter((s) => s.Id === id);
            }
            if (text.includes('FROM ChatSpaces')) {
                const project = text.match(/<=> '([^']+)'/)?.[1];
                return [...spaces].sort(
                    (a, b) =>
                        Number(b.ProjectOurId === project) -
                        Number(a.ProjectOurId === project)
                );
            }
            throw new Error('nieoczekiwane zapytanie: ' + text);
        }
    );
    (ToolsDb.transaction as jest.Mock<any>).mockImplementation(
        async (callback: any) => callback({})
    );
    (ToolsDb.executeSQL as jest.Mock<any>).mockImplementation(
        async (sql: any, params: any) => {
            const text = String(sql);
            insertedSql.push(text);
            if (text.includes('INSERT INTO ChatSpaces')) {
                const row: SpaceRow = {
                    Id: nextSpaceId++,
                    GoogleName: params[0],
                    DisplayName: params[1],
                    Uri: params[2],
                    ProjectOurId: params[3],
                    CreatedAt: '2026-10-04',
                    CreatedByPersonId: params[4],
                };
                spaces.push(row);
                return { insertId: row.Id, affectedRows: 1 };
            }
            if (text.includes('UPDATE Contracts SET ChatSpaceId')) {
                const [spaceId] = params;
                if (text.includes('ChatSpaceId IS NULL') && contract.ChatSpaceId)
                    return { affectedRows: 0 };
                contract.ChatSpaceId = spaceId;
                return { affectedRows: 1 };
            }
            throw new Error('nieoczekiwany zapis: ' + text);
        }
    );
}

function mockGoogle(members: any[] = []) {
    (ToolsChat.createSpaceWithMembers as jest.Mock<any>).mockImplementation(
        async (displayName: any, emails: any) => ({
            name: 'spaces/AAAA1',
            displayName,
            uri: 'https://chat.google.com/room/AAAA1',
            members: members.length
                ? members
                : (emails as string[]).map((email) => ({
                      email,
                      state: 'JOINED',
                  })),
        })
    );
}

describe('ChatSpacesController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetDb();
        mockGoogle();
    });

    describe('utworzenie pokoju', () => {
        it('zakres contract: nazwa "<OurId> <alias>", członkowie bez duplikatów, zapis w bazie i podpięcie', async () => {
            const result = await ChatSpacesController.createForContract(100, {
                scope: 'contract',
                actorPersonId: 3, // ten sam adres co kierownik
            });

            const [name, emails, requestId] = (
                ToolsChat.createSpaceWithMembers as jest.Mock<any>
            ).mock.calls[0] as any[];
            expect(name).toBe('PRU.PT.03 OŚ');
            expect(emails).toEqual([
                'kierownik@envi.com.pl',
            ]); // admin bez PersonAccounts.SystemEmail: pomijany, bez fallbacku
            expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
            expect(result.chatSpace.googleName).toBe('spaces/AAAA1');
            expect(result.chatSpace.projectOurId).toBeNull();
            expect(contract.ChatSpaceId).toBe(result.chatSpace.id);
        });

        it('pomija konto nieaktywne (IsActive = 0)', async () => {
            await ChatSpacesController.createForContract(100, {
                scope: 'contract',
                actorPersonId: 5,
            });
            expect(
                (ToolsChat.createSpaceWithMembers as jest.Mock<any>).mock
                    .calls[0][1]
            ).not.toContain('nieaktywny@envi.com.pl');
            const sql = String(
                (ToolsDb.getQueryCallbackAsync as jest.Mock<any>).mock.calls
                    .map((c: any[]) => c[0])
                    .find((q: any) => String(q).includes('PersonAccounts'))
            );
            expect(sql).toContain('IsActive = 1');
            expect(sql).not.toContain('Persons.SystemEmail');
        });

        it('zakres project: nazwa "<OurId projektu> <alias projektu>" i zapis ProjectOurId', async () => {
            const result = await ChatSpacesController.createForContract(100, {
                scope: 'project',
                actorPersonId: 4, // bez adresu - pomijany
            });
            expect(
                (ToolsChat.createSpaceWithMembers as jest.Mock<any>).mock
                    .calls[0][0]
            ).toBe('PRU.PT.00 Prudnik');
            expect(result.chatSpace.projectOurId).toBe('PRU.PT.00');
        });

        it('własna nazwa ma pierwszeństwo i jest ucinana do 128 znaków', async () => {
            await ChatSpacesController.createForContract(100, {
                scope: 'contract',
                displayName: 'x'.repeat(200),
            });
            expect(
                (ToolsChat.createSpaceWithMembers as jest.Mock<any>).mock
                    .calls[0][0]
            ).toHaveLength(128);
        });

        it('INVITED i FAILED jednego członka nie wywracają operacji i idą w odpowiedzi', async () => {
            mockGoogle([
                { email: 'kierownik@envi.com.pl', state: 'JOINED' },
                { email: 'gosc@gmail.com', state: 'INVITED' },
                { email: 'zly@envi.com.pl', state: 'FAILED', error: 'nie ma konta' },
            ]);
            const result = await ChatSpacesController.createForContract(100, {
                scope: 'contract',
            });
            expect(result.members.map((m) => m.state)).toEqual([
                'JOINED',
                'INVITED',
                'FAILED',
            ]);
            expect(contract.ChatSpaceId).toBe(result.chatSpace.id);
        });

        it('odmawia, gdy kontrakt ma już pokój - bez wywołania Google', async () => {
            contract.ChatSpaceId = 5;
            await expect(
                ChatSpacesController.createForContract(100, {
                    scope: 'contract',
                })
            ).rejects.toMatchObject({ status: 409 });
            expect(ToolsChat.createSpaceWithMembers).not.toHaveBeenCalled();
        });

        it('odmawia dla kontraktu spoza ENVI (brak OurContractsData) - bez wywołania Google', async () => {
            contract.OurId = null;
            await expect(
                ChatSpacesController.createForContract(100, {
                    scope: 'contract',
                })
            ).rejects.toMatchObject({ status: 409 });
            expect(ToolsChat.createSpaceWithMembers).not.toHaveBeenCalled();
        });

        it('błąd Google: nic nie zapisane w bazie', async () => {
            (
                ToolsChat.createSpaceWithMembers as jest.Mock<any>
            ).mockRejectedValue(new Error('403 PERMISSION_DENIED'));
            await expect(
                ChatSpacesController.createForContract(100, {
                    scope: 'contract',
                })
            ).rejects.toBeInstanceOf(ChatSpaceError);
            expect(spaces).toHaveLength(0);
            expect(contract.ChatSpaceId).toBeNull();
        });

        it('błąd bazy po utworzeniu w Google: loguje osierocony spaces/... i rzuca błąd', async () => {
            const errorSpy = jest
                .spyOn(console, 'error')
                .mockImplementation(() => undefined);
            (ToolsDb.transaction as jest.Mock<any>).mockRejectedValue(
                new Error('ER_LOCK_DEADLOCK')
            );
            await expect(
                ChatSpacesController.createForContract(100, {
                    scope: 'contract',
                })
            ).rejects.toThrow('ER_LOCK_DEADLOCK');
            expect(
                errorSpy.mock.calls.some((call) =>
                    String(call[0]).includes('spaces/AAAA1')
                )
            ).toBe(true);
            errorSpy.mockRestore();
        });
    });

    describe('podpięcie i odpięcie', () => {
        beforeEach(() => {
            spaces.push({
                Id: 7,
                GoogleName: 'spaces/BBBB2',
                DisplayName: 'Istniejący',
                Uri: null,
                ProjectOurId: 'PRU.PT.00',
                CreatedAt: '2026-10-01',
                CreatedByPersonId: null,
            });
        });

        it('podpina kontrakt do istniejącego pokoju bez wywołania Google', async () => {
            const space = await ChatSpacesController.attach(100, 7);
            expect(space.id).toBe(7);
            expect(contract.ChatSpaceId).toBe(7);
            expect(ToolsChat.createSpaceWithMembers).not.toHaveBeenCalled();
        });

        it('podpięcie nieistniejącego pokoju: 404', async () => {
            await expect(
                ChatSpacesController.attach(100, 999)
            ).rejects.toMatchObject({ status: 404 });
        });

        it('podpięcie, gdy kontrakt ma inny pokój: 409 (najpierw odepnij)', async () => {
            contract.ChatSpaceId = 5;
            await expect(
                ChatSpacesController.attach(100, 7)
            ).rejects.toMatchObject({ status: 409 });
            expect(contract.ChatSpaceId).toBe(5);
        });

        it('podpięcie kontraktu spoza ENVI: odmowa', async () => {
            contract.OurId = null;
            await expect(
                ChatSpacesController.attach(100, 7)
            ).rejects.toMatchObject({ status: 409 });
        });

        it('odpina: ChatSpaceId = NULL, wiersz ChatSpaces zostaje', async () => {
            contract.ChatSpaceId = 7;
            await ChatSpacesController.detach(100);
            expect(contract.ChatSpaceId).toBeNull();
            expect(spaces).toHaveLength(1);
            expect(insertedSql.some((s) => s.includes('DELETE'))).toBe(false);
        });

        it('odpięcie kontraktu bez pokoju: 409', async () => {
            await expect(ChatSpacesController.detach(100)).rejects.toMatchObject(
                { status: 409 }
            );
        });

        it('listForProject: pokoje podanego projektu pierwsze, isAttachedToContract=false; brak projektu = wszystkie', async () => {
            spaces.unshift({
                Id: 3,
                GoogleName: 'spaces/CCCC3',
                DisplayName: 'Cudzy projekt',
                Uri: null,
                ProjectOurId: 'INNY.00',
                CreatedAt: '2026-09-01',
                CreatedByPersonId: null,
            });
            const list = await ChatSpacesController.listForProject('PRU.PT.00');
            expect(list.map((s) => s.id)).toEqual([7, 3]);
            expect(list.map((s) => s.isOfContractProject)).toEqual([true, false]);
            expect(list.every((s) => s.isAttachedToContract === false)).toBe(true);
            const all = await ChatSpacesController.listForProject('  ');
            expect(all).toHaveLength(2);
            expect(all.every((s) => s.isOfContractProject === false)).toBe(true);
        });

        it('lista: najpierw pokoje projektu kontraktu, potem reszta', async () => {
            spaces.unshift({
                Id: 3,
                GoogleName: 'spaces/CCCC3',
                DisplayName: 'Cudzy projekt',
                Uri: null,
                ProjectOurId: 'INNY.00',
                CreatedAt: '2026-09-01',
                CreatedByPersonId: null,
            });
            const list = await ChatSpacesController.list(100);
            expect(list.map((s) => s.id)).toEqual([7, 3]);
            expect(list[0].isOfContractProject).toBe(true);
        });
    });

    describe('provisionAfterContractCreation', () => {
        it('none: nic nie robi', async () => {
            expect(
                await ChatSpacesController.provisionAfterContractCreation(
                    100,
                    { mode: 'none' }
                )
            ).toEqual({});
            expect(ToolsChat.createSpaceWithMembers).not.toHaveBeenCalled();
        });

        it('błąd Chatu nie rzuca - wraca w polu error', async () => {
            (
                ToolsChat.createSpaceWithMembers as jest.Mock<any>
            ).mockRejectedValue(new Error('Google leży'));
            const result =
                await ChatSpacesController.provisionAfterContractCreation(
                    100,
                    { mode: 'new', scope: 'contract' },
                    1
                );
            expect(result.chatSpaceId).toBeUndefined();
            expect(result.error).toBeInstanceOf(ChatSpaceError);
        });

        it('parseSelection: śmieci = none, poprawne kształty przechodzą', () => {
            expect(ChatSpacesController.parseSelection(undefined)).toEqual({
                mode: 'none',
            });
            expect(
                ChatSpacesController.parseSelection({ mode: 'new', scope: 'x' })
            ).toEqual({ mode: 'none' });
            expect(
                ChatSpacesController.parseSelection({
                    mode: 'new',
                    scope: 'project',
                    displayName: ' Moja ',
                })
            ).toEqual({ mode: 'new', scope: 'project', displayName: 'Moja' });
            expect(
                ChatSpacesController.parseSelection({
                    mode: 'existing',
                    chatSpaceId: '7',
                })
            ).toEqual({ mode: 'existing', chatSpaceId: 7 });
        });
    });
});
