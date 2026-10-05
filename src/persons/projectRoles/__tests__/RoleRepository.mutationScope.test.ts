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
