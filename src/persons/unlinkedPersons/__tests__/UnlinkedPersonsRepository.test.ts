import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import ToolsDb from '../../../tools/ToolsDb';
import UnlinkedPersonsRepository from '../UnlinkedPersonsRepository';

jest.mock('../../../tools/ToolsDb');

/**
 * ROD-8: definicja „bez powiązań" ma zgadzać się z pomiarem odniesienia z planu (4 kryteria, 158 osób
 * na kopii 2026-09-07). Zmiana kryteriów = sprostowanie planu, nie cicha edycja SQL.
 */
describe('UnlinkedPersonsRepository (ROD-8)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('definicja „bez powiązań" = 4 kryteria planu: rola kontraktowa, konto z e-mailem, wiersz uprawnień, profil', () => {
        const sql = UnlinkedPersonsRepository.SQL;
        expect(sql).toMatch(
            /NOT EXISTS \(SELECT 1 FROM Roles r WHERE r\.PersonId = p\.Id\)/,
        );
        expect(sql).toMatch(
            /NOT EXISTS \(SELECT 1 FROM PersonAccounts ae WHERE ae\.PersonId = p\.Id AND NULLIF\(TRIM\(ae\.SystemEmail\), ''\) IS NOT NULL\)/,
        );
        expect(sql).toMatch(
            /NOT EXISTS \(SELECT 1 FROM StaffMembers s WHERE s\.PersonId = p\.Id\)/,
        );
        expect(sql).toMatch(
            /NOT EXISTS \(SELECT 1 FROM PersonProfiles pp WHERE pp\.PersonId = p\.Id\)/,
        );
        // Data wiersza konta i podmiot - decyzja ownera 2026-09-08 (Persons nie ma kolumny daty).
        expect(sql).toMatch(/a\.UpdatedAt AS AccountUpdatedAt/);
        expect(sql).toMatch(/e\.Name AS EntityName/);
        expect(sql).not.toMatch(/DELETE|UPDATE|INSERT/);
    });

    it('mapuje wiersz: dane do --review pod `_`, brak wiersza konta = null', async () => {
        jest.mocked(ToolsDb.getQueryCallbackAsync).mockResolvedValue([
            {
                Id: 5,
                Name: 'Jan',
                Surname: 'Testowy',
                Position: 'Inspektor',
                EntityId: 12,
                EntityName: 'Gmina Testowa',
                AccountUpdatedAt: new Date('2026-02-12T10:00:00'),
            },
            {
                Id: 6,
                Name: 'Anna',
                Surname: 'Próbna',
                Position: '',
                EntityId: 13,
                EntityName: null,
                AccountUpdatedAt: null,
            },
        ] as any);

        const rows = await new UnlinkedPersonsRepository().find();

        expect(rows).toEqual([
            {
                id: 5,
                entityId: 12,
                accountUpdatedAt: new Date('2026-02-12T10:00:00'),
                _name: 'Jan',
                _surname: 'Testowy',
                _position: 'Inspektor',
                _entityName: 'Gmina Testowa',
            },
            {
                id: 6,
                entityId: 13,
                accountUpdatedAt: null,
                _name: 'Anna',
                _surname: 'Próbna',
                _position: '',
                _entityName: null,
            },
        ]);
    });

    it('countAllPersons oddaje liczbę z COUNT(*)', async () => {
        jest.mocked(ToolsDb.getQueryCallbackAsync).mockResolvedValue([
            { n: 448 },
        ] as any);
        expect(await new UnlinkedPersonsRepository().countAllPersons()).toBe(448);
    });
});
