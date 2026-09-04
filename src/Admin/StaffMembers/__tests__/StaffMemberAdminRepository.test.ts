/// <reference types="jest" />
import { describe, expect, it } from '@jest/globals';
import StaffMemberAdminRepository from '../StaffMemberAdminRepository';

/**
 * Warunki WHERE listy okna „Personel i uprawnienia" (pack PER, checkpoint PER-3).
 *
 * `makeAndConditions` jest prywatne, ale to ono decyduje, kogo widać na ekranie, i jest
 * czystą funkcją (`mysql.format` + `ToolsDb.makeOrConditionFromValueOrArray1`) - da się je
 * sprawdzić bez bazy. ToolsDb celowo NIE jest zamockowany: pula łączeń powstaje leniwie,
 * przy pierwszym odwołaniu do `ToolsDb.pool`, a te testy tam nie sięgają.
 */
const repository = new StaffMemberAdminRepository();
const conditionsFor = (params: any): string =>
    (repository as any).makeAndConditions(params);

/** Warunek „ma wiersz uprawnień" - domyślny zakres i zarazem druga połowa zakresu „users". */
const USERS_ONLY = 'StaffMembers.Id IS NOT NULL';

describe('StaffMemberAdminRepository - zakres listy (scope, D-PER-7)', () => {
    it('bez podanego zakresu pokazuje osoby z wierszem uprawnień', () => {
        // Domyślny widok okna po D-PER-7: dawny panel, czyli same osoby z nadanymi flagami.
        // Gdyby ten warunek wypadł, po wejściu na ekran lądowałaby cała książka adresowa.
        const result = conditionsFor({});

        expect(result).toContain(USERS_ONLY);
        expect(result).not.toContain('PersonAccounts.SystemEmail');
    });

    it('zakres „users": użytkownik to e-mail systemowy ALBO wiersz uprawnień, nie oba naraz', () => {
        // Suma, nie iloczyn: osoba z e-mailem logowania nie musi mieć wiersza flag
        // (seed migracji objął tylko role 1/2/3), a wiersz flag da się nadać osobie,
        // która e-maila jeszcze nie dostała.
        const result = conditionsFor({ scope: 'users' });

        expect(result).toContain('PersonAccounts.SystemEmail');
        expect(result).toMatch(/OR\s+StaffMembers\.Id IS NOT NULL/);
    });

    it('zakres „users": pusty e-mail systemowy nie robi z osoby użytkownika', () => {
        // Zaszła kolumna Persons.SystemEmail bywa wypełniona pustym łańcuchem.
        const result = conditionsFor({ scope: 'users' });

        expect(result).toContain("<> ''");
    });

    it('scope „all" zdejmuje zawężenie', () => {
        const result = conditionsFor({ scope: 'all' });

        expect(result).not.toContain(USERS_ONLY);
        expect(result).not.toContain('PersonAccounts.SystemEmail');
    });

    it.each([undefined, '', false, 'ALL', 'true', 'permissions', 'Users'])(
        'wartość %p zakresu znaczy „z uprawnieniami" - rozszerzają WYŁĄCZNIE literalne „users" i „all"',
        (scope) => {
            // Odznaczony przełącznik z dawnego formularza dojeżdżał jako `false`, „Wyczyść"
            // jako pusty string, literówka jako cokolwiek. Żadne z nich nie może otworzyć
            // listy szerzej niż najwęższy zakres.
            const result = conditionsFor({ scope });

            expect(result).toContain(USERS_ONLY);
            expect(result).not.toContain('PersonAccounts.SystemEmail');
        },
    );
});

describe('StaffMemberAdminRepository - stan ostatniej wysyłki do FIDmana (D-PER-8)', () => {
    const baseRow = {
        PersonId: 7,
        Name: 'Anna',
        Surname: 'Testowa',
        StaffMemberId: 3,
        FidmanEnabled: 1,
    };
    const mapRow = (row: any) => (repository as any).mapRowToModel(row);

    it('osoba bez wiersza w kolejce dostaje null, nie „pusty" stan', () => {
        // Plakietka odróżnia „nigdy nie wysyłano" od „oczekuje" - null jest tu wartością.
        expect(mapRow(baseRow)._fidmanSync).toBeNull();
    });

    it('ostatni wiersz kolejki trafia do wiersza listy razem z kierunkiem wysyłki z payloadu', () => {
        const model = mapRow({
            ...baseRow,
            FidmanSyncStatus: 'FAILED',
            FidmanLastError: 'FIDMAN_SYNC_BASE_URL nie ustawione',
            FidmanAttempts: 3,
            FidmanUpdatedAt: '2026-09-04T09:50:16.000Z',
            FidmanPayload: JSON.stringify({ legacyPersonId: 7, email: 'a@b.pl', enabled: true }),
        });

        expect(model._fidmanSync).toEqual({
            status: 'FAILED',
            requestedEnabled: true,
            skipReason: null,
            skipReasonLabel: null,
            lastError: 'FIDMAN_SYNC_BASE_URL nie ustawione',
            attempts: 3,
            updatedAt: '2026-09-04T09:50:16.000Z',
        });
    });

    it('powód pominięcia dostaje etykietę po ludzku z tego samego słownika co umowy', () => {
        const model = mapRow({
            ...baseRow,
            FidmanSyncStatus: 'SKIPPED',
            FidmanSkipReason: 'ENTITY_NOT_IN_FIDMAN',
            FidmanAttempts: 0,
            FidmanPayload: JSON.stringify({ enabled: true }),
        });

        expect(model._fidmanSync?.skipReason).toBe('ENTITY_NOT_IN_FIDMAN');
        expect(model._fidmanSync?.skipReasonLabel).toContain('Podmiotu');
    });

    it('wyłączenie konta w payloadzie daje requestedEnabled = false', () => {
        const model = mapRow({
            ...baseRow,
            FidmanEnabled: 0,
            FidmanSyncStatus: 'SENT',
            FidmanPayload: JSON.stringify({ enabled: false }),
        });

        expect(model._fidmanSync?.requestedEnabled).toBe(false);
    });

    it('uszkodzony payload nie wywraca odczytu listy', () => {
        const model = mapRow({
            ...baseRow,
            FidmanSyncStatus: 'PENDING',
            FidmanPayload: '{nie-json',
        });

        expect(model._fidmanSync?.status).toBe('PENDING');
        expect(model._fidmanSync?.requestedEnabled).toBeNull();
    });
});

describe('StaffMemberAdminRepository - filtr podmiotu i zawężenie do osoby', () => {
    it('filtruje po podmiotach z filtra', () => {
        const result = conditionsFor({ _entities: [{ id: 7 }, { id: 9 }] });

        expect(result).toMatch(
            /\(Persons\.EntityId = 7 OR Persons\.EntityId = 9\)/,
        );
    });

    it('brak wyboru podmiotu nie dokłada warunku', () => {
        const result = conditionsFor({});

        expect(result).not.toContain('Persons.EntityId');
    });

    it('zawężenie do jednej osoby działa razem z zakresem „all"', () => {
        // Tak czyta wiersz kontroler zapisu flag (i tak wejdzie pomost z okna „Osoby",
        // PER-4): osoba może nie być jeszcze użytkownikiem, a i tak musi być widoczna.
        const result = conditionsFor({ personId: 613, scope: 'all' });

        expect(result).toContain('Persons.Id = 613');
        expect(result).not.toContain(USERS_ONLY);
    });
});
