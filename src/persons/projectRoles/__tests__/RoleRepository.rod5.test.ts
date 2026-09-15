import { describe, expect, it, jest } from '@jest/globals';
import RoleRepository from '../RoleRepository';
import ToolsDb from '../../../tools/ToolsDb';

/**
 * ROD-5: rola systemowa osoby przy roli kontraktowej (potrzebna tylko do podmiany podmiotu
 * współpracownika na „ENVI") pochodzi z aktywnego konta, nie z zaszłej kolumny Persons.
 * Złączenie zewnętrzne: osoba bez konta nadal ma rolę kontraktową na liście.
 */
describe('RoleRepository - ROD-5: rola systemowa z konta', () => {
    it('zapytanie listy ról nie sięga do Persons.SystemRoleId', async () => {
        const querySpy = jest
            .spyOn(ToolsDb, 'getQueryCallbackAsync')
            .mockResolvedValue([] as any);

        await new RoleRepository().find([{ personId: 7 }]);

        const sql = String(querySpy.mock.calls[0][0]);
        expect(sql).not.toContain('Persons.SystemRoleId');
        expect(sql).toContain(
            'LEFT JOIN PersonAccounts ON PersonAccounts.PersonId = Persons.Id AND PersonAccounts.IsActive = 1',
        );
        expect(sql).toContain(
            'LEFT JOIN SystemRoles ON SystemRoles.Id = PersonAccounts.SystemRoleId',
        );
        expect(sql).toContain('SystemRoles.Name AS SystemRoleName');
    });
});
