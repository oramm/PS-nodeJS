import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import PersonRepository from '../PersonRepository';
import ToolsDb from '../../tools/ToolsDb';

/**
 * ROD-5 (pack ROD, 2026-09-08): rola, e-mail logowania i konto Google są czytane WYŁĄCZNIE
 * z PersonAccounts. Zapas COALESCE na zaszłe kolumny Persons był drugą, niekontrolowaną
 * drogą do logowania: e-mail zdjęty z konta (albo konto wyłączone) nadal logował po zaszłej
 * kolumnie. Test pilnuje kształtu SQL, bo tylko on decyduje, skąd bierze się tożsamość -
 * i tego, że ścieżek zaszłych (flaga PERSONS_MODEL_V2_LEGACY_READ) już nie ma.
 */
const LEGACY_MARKERS = [
    'Persons.SystemRoleId',
    'Persons.SystemEmail',
    'Persons.GoogleId',
    'Persons.GoogleRefreshToken',
    'LegacySystemRoles',
    'COALESCE(PersonAccounts',
];

describe('PersonRepository - ROD-5: jedna prawda o koncie', () => {
    let repository: PersonRepository;
    let querySpy: any;

    beforeEach(() => {
        repository = new PersonRepository();
        querySpy = jest
            .spyOn(ToolsDb, 'getQueryCallbackAsync')
            .mockResolvedValue([] as any);
    });

    const lastSql = (): string =>
        String(querySpy.mock.calls[querySpy.mock.calls.length - 1][0]);

    it('ścieżki zaszłe i flaga odczytu nie istnieją', () => {
        expect((repository as any).findLegacy).toBeUndefined();
        expect((repository as any).findV2).toBeUndefined();
        expect((repository as any).getSystemRoleLegacy).toBeUndefined();
        expect((repository as any).getSystemRoleV2).toBeUndefined();
        expect((repository as any).isV2ReadEnabled).toBeUndefined();
    });

    it('lista osób czyta rolę i e-mail logowania tylko z AKTYWNEGO konta', async () => {
        await repository.find([
            { systemRoleName: 'ENVI_EMPLOYEE|ENVI_MANAGER' },
            { systemEmail: 'ktos@firma.pl' },
        ]);

        const sql = lastSql();
        for (const marker of LEGACY_MARKERS) expect(sql).not.toContain(marker);
        expect(sql).toContain('PersonAccounts.SystemEmail AS SystemEmail');
        expect(sql).toContain('PersonAccounts.SystemRoleId AS SystemRoleId');
        expect(sql).toContain(
            'LEFT JOIN PersonAccounts ON PersonAccounts.PersonId = Persons.Id AND PersonAccounts.IsActive = 1',
        );
        expect(sql).toContain(
            'LEFT JOIN SystemRoles ON PersonAccounts.SystemRoleId = SystemRoles.Id',
        );
        expect(sql).toContain(
            "SystemRoles.Name REGEXP 'ENVI_EMPLOYEE|ENVI_MANAGER'",
        );
        expect(sql).toContain("PersonAccounts.SystemEmail='ktos@firma.pl'");
    });

    it('tożsamość do logowania: tylko aktywne konto z rolą, bez zapasu na Persons', async () => {
        const result = await repository.getSystemRole({
            systemEmail: 'ktos@firma.pl',
        });

        const sql = lastSql();
        for (const marker of LEGACY_MARKERS) expect(sql).not.toContain(marker);
        expect(sql).toContain("PersonAccounts.SystemEmail = 'ktos@firma.pl'");
        // Złączenia wewnętrzne: brak aktywnego konta albo konto bez roli = brak dostępu.
        expect(sql).toContain(
            'JOIN PersonAccounts ON PersonAccounts.PersonId = Persons.Id AND PersonAccounts.IsActive = 1',
        );
        expect(sql).not.toContain('LEFT JOIN PersonAccounts');
        expect(sql).toContain(
            'JOIN SystemRoles ON PersonAccounts.SystemRoleId = SystemRoles.Id',
        );
        expect(sql).not.toContain('LEFT JOIN SystemRoles');
        expect(result).toBeUndefined();
    });

    it('rola po numerze osoby (sprawdzenia scruma) też idzie przez konto', async () => {
        await repository.getSystemRole({ id: 386 });

        const sql = lastSql();
        expect(sql).toContain('Persons.Id = 386');
        for (const marker of LEGACY_MARKERS) expect(sql).not.toContain(marker);
    });

    it('wiersz konta jest odwzorowany bez pól z Persons', async () => {
        querySpy.mockResolvedValueOnce([
            {
                SystemRoleId: 3,
                PersonId: 610,
                GoogleId: null,
                GoogleRefreshToken: null,
                MicrosoftId: null,
                SystemRoleName: 'ENVI_EMPLOYEE',
            },
        ]);

        await expect(repository.getSystemRole({ id: 610 })).resolves.toEqual({
            id: 3,
            name: 'ENVI_EMPLOYEE',
            personId: 610,
            googleId: undefined,
            microsofId: undefined,
            googleRefreshToken: undefined,
        });
    });

    it('źródło danych dla FIDmana bierze e-mail logowania tylko z konta', async () => {
        const conn = { query: jest.fn(async () => [[]]) };

        await repository.getFidmanUserSourceInConn(conn as any, 7);

        const sql = String((conn.query.mock.calls[0] as any[])[0]);
        for (const marker of LEGACY_MARKERS) expect(sql).not.toContain(marker);
        expect(sql).toContain('PersonAccounts.SystemEmail AS SystemEmail');
    });
});
