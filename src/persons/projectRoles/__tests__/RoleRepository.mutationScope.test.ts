jest.mock('../../../tools/ToolsDb');
import RoleRepository from '../RoleRepository';

describe('WNM-2 zakres zapisanej roli', () => {
    const repo = new RoleRepository();

    it('rola umowy odczytywana i blokowana po Id', async () => {
        const row = { Id: 7, ContractId: 42, ProjectOurId: null, PersonId: 5 };
        const conn: any = { query: jest.fn().mockResolvedValue([[row]]) };
        expect(await repo.rolesForMutation(7, conn)).toEqual([row]);
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), [7]);
        expect(conn.query).toHaveBeenCalledTimes(1);
    });

    it('samodzielna rola projektu z NULL obejmuje ten wiersz', async () => {
        const row = { Id: 7, ContractId: null, ProjectOurId: 'PRJ.1', PersonId: 5 };
        const conn: any = { query: jest.fn().mockResolvedValue([[row]]) };
        expect(await repo.rolesForMutation(7, conn)).toEqual([row]);
        expect(conn.query).toHaveBeenCalledTimes(1);
    });

    it('kopie projektu wyszukuje według starego projektu i osoby, niezależnie od nowych danych żądania', async () => {
        const first = { Id: 7, ContractId: 42, ProjectOurId: 'PRJ.1', PersonId: 5 };
        const copies = [first, { ...first, Id: 8, ContractId: 43 }];
        const conn: any = { query: jest.fn().mockResolvedValueOnce([[first]]).mockResolvedValueOnce([copies]) };
        expect(await repo.rolesForMutation(7, conn)).toEqual(copies);
        expect(conn.query.mock.calls[1]).toEqual([expect.stringContaining('FOR UPDATE'), ['PRJ.1', 5]]);
    });

    it('brak roli przerywa operację', async () => {
        const conn: any = { query: jest.fn().mockResolvedValue([[]]) };
        await expect(repo.rolesForMutation(7, conn)).rejects.toThrow('Nie znaleziono roli');
    });

    it('umowy projektu odczytuje tym samym połączeniem, pusty zakres nie buduje IN ()', async () => {
        const conn: any = { query: jest.fn().mockResolvedValue([[{ Id: 42 }, { Id: 43 }]]) };
        expect(await repo.projectContractIds('PRJ.1', conn)).toEqual([42, 43]);
        expect(conn.query).toHaveBeenCalledWith(expect.stringContaining('ProjectOurId = ?'), ['PRJ.1']);
        conn.query.mockClear();
        expect(await repo.readScopes([], conn)).toEqual([]);
        expect(conn.query).not.toHaveBeenCalled();
    });
});

describe('usuniecie roli: zakres kopii tej samej roli', () => {
    const repo = new RoleRepository();
    const row = (over: any = {}) => ({
        Id: 7, ContractId: 42, ProjectOurId: 'PRJ.1', PersonId: 5,
        Name: 'Kierownik Zespołu', Description: '', GroupName: 'Inżynier', ...over,
    });
    const connWith = (...results: any[][]) => {
        const query = jest.fn();
        for (const result of results) query.mockResolvedValueOnce([result]);
        return { query } as any;
    };

    it('kopie tej samej roli znikaja razem, inna rola osoby w projekcie zostaje', async () => {
        const target = row();
        const copy = row({ Id: 8, ContractId: 43 });
        const legacyProjectRole = row({ Id: 9, ContractId: null });
        const otherRole = row({ Id: 10, ContractId: 42, Name: 'Koordynator' });
        const otherGroup = row({ Id: 11, ContractId: 43, GroupName: 'Pozostali' });
        const caseVariant = row({ Id: 12, ContractId: 44, Name: 'Kierownik zespołu' });
        const otherDescription = row({ Id: 13, ContractId: 45, Description: 'inny opis' });
        const conn = connWith([target], [target, copy, legacyProjectRole, otherRole, otherGroup, caseVariant, otherDescription]);
        const result = await repo.rolesForDeletion(7, conn);
        expect(result.map((r) => r.Id)).toEqual([7, 8, 9]);
        expect(conn.query.mock.calls[1]).toEqual([expect.stringContaining('FOR UPDATE'), ['PRJ.1', 5]]);
    });

    it('usuniecie roli starego typu (bez umowy) obejmuje ten sam zestaw', async () => {
        const target = row({ ContractId: null });
        const copy = row({ Id: 8, ContractId: 43 });
        const other = row({ Id: 10, Name: 'Koordynator' });
        const result = await repo.rolesForDeletion(7, connWith([target], [target, copy, other]));
        expect(result.map((r) => r.Id)).toEqual([7, 8]);
    });

    it('rola samej umowy to jeden wiersz i jedno zapytanie', async () => {
        const target = row({ ProjectOurId: null });
        const conn = connWith([target]);
        expect(await repo.rolesForDeletion(7, conn)).toEqual([target]);
        expect(conn.query).toHaveBeenCalledTimes(1);
    });

    it('brak roli przerywa operacje', async () => {
        await expect(repo.rolesForDeletion(7, connWith([]))).rejects.toThrow('Nie znaleziono roli');
    });
});
