import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import ToolsDb from '../../tools/ToolsDb';
import PersonRepository from '../PersonRepository';

jest.mock('../../tools/ToolsDb');

describe('PersonsController P2-C endpoint compatibility', () => {
    const mockConn = { threadId: 999 } as any;

    beforeEach(async () => {
        jest.clearAllMocks();
        (ToolsDb.transaction as jest.Mock).mockImplementation(
            async (...args: any[]) => {
                const callback = args[0] as (conn: any) => Promise<any>;
                return await callback(mockConn);
            },
        );

        const { default: PersonsController } = await import('../PersonsController');
        (PersonsController as any).instance = undefined;
    });

    it('freezes legacy account-field writes in Persons when WRITE_DUAL=false', async () => {
        const { default: PersonsController } = await import('../PersonsController');
        const editSpy = jest
            .spyOn(PersonRepository.prototype, 'editInDb')
            .mockResolvedValue(undefined as any);
        const upsertSpy = jest
            .spyOn(PersonRepository.prototype, 'upsertPersonAccountInDb')
            .mockResolvedValue(undefined);

        await PersonsController.editFromDto(
            {
                id: 210001,
                name: 'Legacy',
                surname: 'Endpoint',
                systemRoleId: 2,
                _entity: { id: 1 },
            },
            ['systemRoleId'],
        );

        expect(editSpy).not.toHaveBeenCalled();
        expect(ToolsDb.transaction).toHaveBeenCalledTimes(1);
        expect(upsertSpy).toHaveBeenCalledWith(
            expect.objectContaining({ id: 210001, systemRoleId: 2 }),
            mockConn,
            ['systemRoleId'],
        );
    });

    it('editing only systemRoleId does not sync/clear systemEmail in PersonAccounts', async () => {
        const { default: PersonsController } = await import('../PersonsController');
        const editSpy = jest
            .spyOn(PersonRepository.prototype, 'editInDb')
            .mockResolvedValue(undefined as any);
        const upsertSpy = jest
            .spyOn(PersonRepository.prototype, 'upsertPersonAccountInDb')
            .mockResolvedValue(undefined);

        await PersonsController.editFromDto(
            {
                id: 210002,
                name: 'Role',
                surname: 'Only',
                systemRoleId: 4,
                _entity: { id: 1 },
            },
            ['systemRoleId'],
        );

        expect(editSpy).not.toHaveBeenCalled();
        expect(ToolsDb.transaction).toHaveBeenCalledTimes(1);
        expect(upsertSpy).toHaveBeenCalledWith(
            expect.objectContaining({ id: 210002, systemRoleId: 4 }),
            mockConn,
            ['systemRoleId'],
        );
    });

    it('editing only systemEmail does not sync/clear systemRoleId in PersonAccounts', async () => {
        const { default: PersonsController } = await import('../PersonsController');
        const editSpy = jest
            .spyOn(PersonRepository.prototype, 'editInDb')
            .mockResolvedValue(undefined as any);
        const upsertSpy = jest
            .spyOn(PersonRepository.prototype, 'upsertPersonAccountInDb')
            .mockResolvedValue(undefined);

        await PersonsController.editFromDto(
            {
                id: 210003,
                name: 'Email',
                surname: 'Only',
                systemEmail: 'p2c.partial@test.local',
                _entity: { id: 1 },
            },
            ['systemEmail'],
        );

        expect(editSpy).not.toHaveBeenCalled();
        expect(ToolsDb.transaction).toHaveBeenCalledTimes(1);
        expect(upsertSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 210003,
                systemEmail: 'p2c.partial@test.local',
            }),
            mockConn,
            ['systemEmail'],
        );
    });

    it('freezes legacy account fields in Persons on addNewSystemUser', async () => {
        const { default: PersonsController } = await import('../PersonsController');
        const addSpy = jest
            .spyOn(PersonRepository.prototype, 'addInDb')
            .mockImplementation(async (person: any) => {
                person.id = 210004;
                return person;
            });
        const upsertSpy = jest
            .spyOn(PersonRepository.prototype, 'upsertPersonAccountInDb')
            .mockResolvedValue(undefined);

        await PersonsController.addNewSystemUser({
            name: 'System',
            surname: 'User',
            systemRoleId: 1,
            systemEmail: 'p4a.user@test.local',
            entityId: 1,
            _entity: { id: 1 },
        } as any);

        expect(ToolsDb.transaction).toHaveBeenCalledTimes(1);
        expect(addSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                systemRoleId: undefined,
                systemEmail: undefined,
            }),
            mockConn,
            true,
        );
        expect(upsertSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 210004,
                systemRoleId: 1,
                systemEmail: 'p4a.user@test.local',
            }),
            mockConn,
        );
    });
});
