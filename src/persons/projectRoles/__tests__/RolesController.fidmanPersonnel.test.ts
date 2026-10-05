jest.mock('../../../tools/ToolsDb');
jest.mock('../RoleRepository');
jest.mock('../../../contracts/fidmanSync/FidmanSync', () => ({
    enqueueFidmanPersonnelForRoles: jest.fn(),
    tryDeliverAfterCommit: jest.fn(),
}));
import ToolsDb from '../../../tools/ToolsDb';
import RoleRepository from '../RoleRepository';
import RolesController from '../RolesController';
import { enqueueFidmanPersonnelForRoles, tryDeliverAfterCommit } from '../../../contracts/fidmanSync/FidmanSync';

describe('WNM-2 transakcje ról', () => {
    const conn = {} as any;
    const events: string[] = [];
    const proto = RoleRepository.prototype as any;
    const role = (over: any = {}) => ({ id: 7, name: 'Inspektor', groupName: 'Inżynier', personId: 5, _contract: { id: 42 }, ...over }) as any;
    const old = (over: any = {}) => ({ Id: 7, ContractId: 42, ProjectOurId: null, PersonId: 5, ...over });

    beforeEach(() => {
        jest.clearAllMocks();
        events.length = 0;
        (ToolsDb.transaction as any).mockImplementation(async (cb: any) => {
            events.push('begin');
            const result = await cb(conn);
            events.push('commit');
            return result;
        });
        for (const name of ['addInDb', 'editInDb', 'deleteFromDb']) {
            proto[name].mockImplementation(async (_item: any, connection: any, tx: any) => {
                expect(connection).toBe(conn);
                expect(tx).toBe(true);
                events.push(name);
            });
        }
        proto.rolesForMutation.mockResolvedValue([old()]);
        proto.rolesForDeletion.mockResolvedValue([old()]);
        proto.projectContractIds.mockResolvedValue([42, 43]);
        proto.readScopes.mockResolvedValue([{ ContractId: 42, ProjectOurId: null }]);
        (enqueueFidmanPersonnelForRoles as any).mockImplementation(async (_scopes: any, connection: any) => {
            expect(connection).toBe(conn);
            events.push('enqueue');
            return [101];
        });
        (tryDeliverAfterCommit as any).mockImplementation(async () => { events.push('deliver'); });
    });

    it.each(['addNewRole', 'updateRole', 'deleteRole'] as const)('%s kolejkuje umowę w transakcji i dostarcza po commit', async (method) => {
        await RolesController[method](role());
        expect(enqueueFidmanPersonnelForRoles).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ ContractId: 42, ProjectOurId: null })]), conn);
        const write = method === 'addNewRole' ? 'addInDb' : method === 'updateRole' ? 'editInDb' : 'deleteFromDb';
        expect(events).toEqual(['begin', write, 'enqueue', 'commit', 'deliver']);
    });

    it('dodanie projektu zachowuje kopie PS i kolejkuje ich umowy', async () => {
        await RolesController.addNewRole(role({ _contract: undefined, _project: { ourId: 'PRJ.1' } }));
        expect(proto.addInDb).toHaveBeenCalledTimes(2);
        expect(enqueueFidmanPersonnelForRoles).toHaveBeenCalledWith([
            { ContractId: 42, ProjectOurId: 'PRJ.1' }, { ContractId: 43, ProjectOurId: 'PRJ.1' },
        ], conn);
        expect(events).toEqual(['begin', 'addInDb', 'addInDb', 'enqueue', 'commit', 'deliver']);
    });

    it('dodanie roli projektu ROZNE. nie przekazuje kopii do kolejki', async () => {
        await RolesController.addNewRole(role({ _contract: undefined, _project: { ourId: 'ROZNE.1' } }));
        expect(enqueueFidmanPersonnelForRoles).toHaveBeenCalledWith([], conn);
    });

    it('edycja zmieniająca umowę obejmuje stary i zapisany nowy zakres', async () => {
        proto.readScopes.mockResolvedValue([{ ContractId: 99, ProjectOurId: null }]);
        await RolesController.updateRole(role({ _contract: { id: 99 } }));
        expect(enqueueFidmanPersonnelForRoles).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ ContractId: 42 }), { ContractId: 99, ProjectOurId: null },
        ]), conn);
    });

    it('rola bez ContractId zmienia projekt: odświeża stare i nowe umowy projektu', async () => {
        proto.rolesForMutation.mockResolvedValue([old({ ContractId: null, ProjectOurId: 'PRJ.1' })]);
        proto.readScopes.mockResolvedValue([{ ContractId: null, ProjectOurId: 'PRJ.2' }]);
        await RolesController.updateRole(role({ _contract: undefined, _project: { ourId: 'PRJ.2' } }));
        expect(enqueueFidmanPersonnelForRoles).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ ContractId: null, ProjectOurId: 'PRJ.1' }),
            { ContractId: null, ProjectOurId: 'PRJ.2' },
        ]), conn);
    });

    it('przeniesienie kopii projektowych usuwa stare i dodaje kopie w nowym projekcie', async () => {
        proto.rolesForMutation.mockResolvedValue([old({ ProjectOurId: 'PRJ.1' })]);
        proto.projectContractIds.mockResolvedValue([99]);
        proto.readScopes.mockResolvedValue([]);
        await RolesController.updateRole(role({ _project: { ourId: 'PRJ.2' } }));
        expect(proto.deleteFromDb).toHaveBeenCalledTimes(1);
        expect(proto.addInDb).toHaveBeenCalledTimes(1);
        expect(enqueueFidmanPersonnelForRoles).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ ContractId: 42, ProjectOurId: 'PRJ.1' }),
            { ContractId: 99, ProjectOurId: 'PRJ.2' },
        ]), conn);
    });

    it.each([undefined, ['contractId']])('konwersja trzech kopii zachowuje tylko edytowany wiersz (%j)', async (fields) => {
        let rows = [
            old({ Id: 6, ContractId: 41, ProjectOurId: 'PRJ.1' }),
            old({ ProjectOurId: 'PRJ.1' }),
            old({ Id: 8, ContractId: 43, ProjectOurId: 'PRJ.1' }),
        ];
        proto.rolesForMutation.mockResolvedValue(rows.slice());
        proto.deleteFromDb.mockImplementation(async (item: any, connection: any, tx: any) => {
            expect(connection).toBe(conn);
            expect(tx).toBe(true);
            rows = rows.filter((row) => row.Id !== item.id);
            events.push('deleteFromDb');
        });
        proto.editInDb.mockImplementation(async (item: any, connection: any, tx: any) => {
            expect(connection).toBe(conn);
            expect(tx).toBe(true);
            rows = rows.map((row) => row.Id === item.id
                ? { ...row, ContractId: item.contractId, ProjectOurId: item.projectOurId } : row);
            events.push('editInDb');
        });
        proto.readScopes.mockImplementation(async () => rows);
        await RolesController.updateRole(role({ _contract: { id: 99 } }), fields);
        expect(rows).toEqual([old({ ContractId: 99 })]);
        expect(proto.editInDb).toHaveBeenCalledTimes(1);
        expect(proto.deleteFromDb).toHaveBeenCalledTimes(2);
        expect(proto.editInDb).toHaveBeenCalledWith(
            expect.objectContaining({ id: 7, contractId: 99, projectOurId: null }), conn, true,
            fields ? ['contractId', 'projectOurId'] : undefined);
        expect(enqueueFidmanPersonnelForRoles).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ ContractId: 41, ProjectOurId: 'PRJ.1' }),
            expect.objectContaining({ ContractId: 42, ProjectOurId: 'PRJ.1' }),
            expect.objectContaining({ ContractId: 43, ProjectOurId: 'PRJ.1' }),
            expect.objectContaining({ ContractId: 99, ProjectOurId: null }),
        ]), conn);
        expect(events).toEqual(['begin', 'deleteFromDb', 'editInDb', 'deleteFromDb', 'enqueue', 'commit', 'deliver']);
    });

    it('edycja samej nazwy nie usuwa kopii projektu dla żądania roli umowy', async () => {
        proto.rolesForMutation.mockResolvedValue([
            old({ ProjectOurId: 'PRJ.1' }), old({ Id: 8, ContractId: 43, ProjectOurId: 'PRJ.1' }),
        ]);
        await RolesController.updateRole(role(), ['name']);
        expect(proto.deleteFromDb).not.toHaveBeenCalled();
        expect(proto.editInDb).toHaveBeenCalledTimes(2);
        expect(proto.editInDb).toHaveBeenCalledWith(expect.anything(), conn, true, ['name']);
    });

    it('fieldsToUpdate bez projektu nie przenosi kopii do innego projektu', async () => {
        proto.rolesForMutation.mockResolvedValue([old({ ProjectOurId: 'PRJ.1' })]);
        proto.readScopes.mockResolvedValue([{ ContractId: 42, ProjectOurId: 'PRJ.1' }]);
        await RolesController.updateRole(role({ _project: { ourId: 'PRJ.2' } }), ['name']);
        expect(proto.deleteFromDb).not.toHaveBeenCalled();
        expect(proto.addInDb).not.toHaveBeenCalled();
        expect(proto.editInDb).toHaveBeenCalledWith(expect.anything(), conn, true, ['name']);
    });

    it.each(['updateRole', 'deleteRole'] as const)('%s roli projektu zbiorczego nie kolejkuje kopii', async (method) => {
        proto.rolesForMutation.mockResolvedValue([old({ ProjectOurId: 'ROZNE.1' })]);
        proto.rolesForDeletion.mockResolvedValue([old({ ProjectOurId: 'ROZNE.1' })]);
        proto.readScopes.mockResolvedValue([{ ContractId: 42, ProjectOurId: 'ROZNE.1' }]);
        await RolesController[method](role({ _project: { ourId: 'ROZNE.1' } }));
        expect(enqueueFidmanPersonnelForRoles).toHaveBeenCalledWith([], conn);
    });

    it('usuniecie roli projektu kasuje wylacznie kopie wskazane przez repozytorium i kolejkuje wszystkie ich umowy', async () => {
        const copies = [
            old({ Id: 7, ContractId: 42, ProjectOurId: 'PRJ.1' }),
            old({ Id: 8, ContractId: 43, ProjectOurId: 'PRJ.1' }),
            old({ Id: 9, ContractId: null, ProjectOurId: 'PRJ.1' }),
        ];
        proto.rolesForDeletion.mockResolvedValue(copies);
        const deleted: number[] = [];
        proto.deleteFromDb.mockImplementation(async (item: any) => { deleted.push(item.id); events.push('deleteFromDb'); });
        await RolesController.deleteRole(role({ _contract: undefined, _project: { ourId: 'PRJ.1' } }));
        expect(proto.rolesForDeletion).toHaveBeenCalledWith(7, conn);
        expect(proto.rolesForMutation).not.toHaveBeenCalled();
        expect(deleted).toEqual([7, 8, 9]);
        expect(enqueueFidmanPersonnelForRoles).toHaveBeenCalledWith([
            expect.objectContaining({ ContractId: 42, ProjectOurId: 'PRJ.1' }),
            expect.objectContaining({ ContractId: 43, ProjectOurId: 'PRJ.1' }),
            expect.objectContaining({ ContractId: null, ProjectOurId: 'PRJ.1' }),
        ], conn);
        expect(events).toEqual(['begin', 'deleteFromDb', 'deleteFromDb', 'deleteFromDb', 'enqueue', 'commit', 'deliver']);
    });

    it('usuniecie roli samej umowy kasuje jeden wiersz', async () => {
        await RolesController.deleteRole(role());
        expect(proto.deleteFromDb).toHaveBeenCalledTimes(1);
        expect(proto.deleteFromDb).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), conn, true);
    });

    it('po błędzie kolejki zapis roli nie commitował i nie ma dostawy', async () => {
        (enqueueFidmanPersonnelForRoles as any).mockRejectedValue(new Error('outbox failed'));
        await expect(RolesController.addNewRole(role())).rejects.toThrow('outbox failed');
        expect(events).toEqual(['begin', 'addInDb']);
        expect(tryDeliverAfterCommit).not.toHaveBeenCalled();
    });
});
