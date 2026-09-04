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

    /**
     * PER-2 odwrócił trzy testy, które stały tu wcześniej. Do 2026-09-03 wymagały one, żeby
     * `editFromDto` z `_fieldsToUpdate: ['systemRoleId'|'systemEmail']` zapisywał konto -
     * to była zamrożona zgodność wsteczna z czasu migracji v2. Od PER-2 konto ma jedną drogę
     * zapisu (`upsertPersonAccountV2`), bo tylko ona unieważnia sesje po zmianie roli,
     * zakłada domyślne flagi i kolejkuje push do FIDmana. Historia w progresie packa PER.
     */
    it('ignores account fields on editFromDto even when the client asks for them', async () => {
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
                systemEmail: 'per2.escalation@test.local',
                _entity: { id: 1 },
            },
            ['systemRoleId', 'systemEmail'],
        );

        expect(upsertSpy).not.toHaveBeenCalled();
        expect(ToolsDb.transaction).not.toHaveBeenCalled();
        expect(editSpy).not.toHaveBeenCalled();
    });

    it('still writes person fields and leaves the account alone', async () => {
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
                name: 'Person',
                surname: 'Fields',
                systemRoleId: 1,
                _entity: { id: 1 },
            },
            ['name', 'surname', 'systemRoleId'],
        );

        expect(editSpy).toHaveBeenCalledWith(
            expect.objectContaining({ id: 210002 }),
            undefined,
            undefined,
            ['name', 'surname'],
        );
        expect(upsertSpy).not.toHaveBeenCalled();
    });

    it('ignores account fields also when the client sends no field list', async () => {
        const { default: PersonsController } = await import('../PersonsController');
        jest.spyOn(PersonRepository.prototype, 'editInDb').mockResolvedValue(
            undefined as any,
        );
        const upsertSpy = jest
            .spyOn(PersonRepository.prototype, 'upsertPersonAccountInDb')
            .mockResolvedValue(undefined);

        await PersonsController.editFromDto(
            {
                id: 210003,
                name: 'Default',
                surname: 'Fields',
                systemRoleId: 1,
                systemEmail: 'per2.default@test.local',
                _entity: { id: 1 },
            },
            [],
        );

        expect(upsertSpy).not.toHaveBeenCalled();
    });

    /**
     * Znalezisko PER-2: `editUserFromDto` (zaszła trasa PUT /user/:id) czytało TĘ SAMĄ stałą
     * co `editFromDto`, więc wycięcie z niej pól konta odcięłoby zapis konta trasie, która
     * wg D-PER-5 (a) ma dalej działać - jest jedyną, która odświeża arkusz scruma. Test
     * pilnuje rozdziału obu list; pełnego przebiegu trasy nie da się tu sprawdzić, bo
     * `withAuth` sięga po token Google.
     */
    it('keeps account fields only on the legacy user field list', async () => {
        const { default: PersonsController } = await import('../PersonsController');
        const legacyFields = (PersonsController as any).LEGACY_USER_EDIT_FIELDS;
        const defaultFields = (PersonsController as any).DEFAULT_EDIT_FIELDS;

        expect(legacyFields).toEqual(
            expect.arrayContaining(['systemRoleId', 'systemEmail']),
        );
        expect(defaultFields).not.toContain('systemRoleId');
        expect(defaultFields).not.toContain('systemEmail');
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
