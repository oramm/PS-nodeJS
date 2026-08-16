/**
 * GLO-P1 (D-GLO-4) — testy payloadu `user.upsert` bez bazy.
 *
 * Zakres:
 *  (a) buildUserUpsert — kształt zgodny z kontraktem FIDmana (apps/api/src/ps-sync/validation.ts)
 *  (b) telefon: jedzie bez zmian, także za długi (przycinanie jest zabronione), pusty znika
 *  (c) validateFidmanUserSource — brak SystemEmail, format, limity długości, brak podmiotu
 *  (d) enqueueFidmanUserPush — wiersz outboxu przez TĘ SAMĄ transakcję, RefId = PersonId
 *  (e) etykiety powodów pominięcia dla pięciu przypadków użytkownika
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../tools/ToolsDb');

import {
    buildUserUpsert,
    validateFidmanUserSource,
    enqueueFidmanUserPush,
    fidmanSkipReasonLabel,
    FIDMAN_USER_LIMITS,
    type FidmanUserSource,
} from '../FidmanSync';

const source = (overrides: Partial<FidmanUserSource> = {}): FidmanUserSource => ({
    personId: 5150,
    entityId: 1,
    name: 'Anna',
    surname: 'Kowalska',
    systemEmail: 'anna.kowalska@envi.com.pl',
    cellphone: '600100200',
    ...overrides,
});

describe('buildUserUpsert — kształt payloadu', () => {
    it('niesie klucze idempotencji i pola należące do PS', () => {
        expect(buildUserUpsert(source(), true)).toEqual({
            kind: 'user.upsert',
            payload: {
                legacyPersonId: 5150,
                legacyEntityId: 1,
                email: 'anna.kowalska@envi.com.pl',
                name: 'Anna',
                surname: 'Kowalska',
                phone: '600100200',
                enabled: true,
            },
        });
    });

    it('odznaczenie w PS to wyłączenie konta, nie kasowanie — enabled:false', () => {
        const envelope = buildUserUpsert(source(), false);
        expect(envelope.kind).toBe('user.upsert');
        expect((envelope.payload as any).enabled).toBe(false);
        // Klucz dopasowania jedzie tak samo jak przy włączaniu — bez niego FIDman nie
        // wiedziałby, które konto wyłączyć.
        expect((envelope.payload as any).legacyPersonId).toBe(5150);
    });

    it('pusty telefon nie jedzie wcale, zamiast jechać jako pusty ciąg', () => {
        const payload = buildUserUpsert(source({ cellphone: '   ' }), true)
            .payload as any;
        expect(payload).not.toHaveProperty('phone');
    });

    it('za długi telefon jedzie BEZ ZMIAN — przycięcie dałoby numer, który wygląda na prawdziwy', () => {
        // 2 osoby ze 179 mają dziś numer dłuższy niż kolumna FIDmana (pomiar GLO-R0).
        // Pomijanie takiego numeru jest świadomie po stronie FIDmana, nie tutaj.
        const long = '+48 600 100 200 wew. 15';
        const payload = buildUserUpsert(source({ cellphone: long }), true)
            .payload as any;
        expect(payload.phone).toBe(long);
    });

    it('przycina białe znaki, żeby ' + '" Anna "' + ' nie trafiło do FIDmana z odstępami', () => {
        const payload = buildUserUpsert(
            source({ name: '  Anna ', surname: ' Kowalska  ', systemEmail: ' a@b.pl ' }),
            true
        ).payload as any;
        expect(payload.name).toBe('Anna');
        expect(payload.surname).toBe('Kowalska');
        expect(payload.email).toBe('a@b.pl');
    });
});

describe('validateFidmanUserSource — PS odmawia zamiast wysyłać payload na 400', () => {
    it('komplet danych przechodzi', () => {
        expect(validateFidmanUserSource(source())).toEqual([]);
    });

    it('flaga bez e-maila systemowego — komunikat po polsku', () => {
        expect(validateFidmanUserSource(source({ systemEmail: null }))).toContain(
            'Użytkownik FIDmana musi mieć e-mail systemowy.'
        );
    });

    it('sam odstęp to nie adres', () => {
        expect(validateFidmanUserSource(source({ systemEmail: '   ' }))).toContain(
            'Użytkownik FIDmana musi mieć e-mail systemowy.'
        );
    });

    it('adres bez kropki w domenie nie przejdzie wzorca FIDmana', () => {
        expect(
            validateFidmanUserSource(source({ systemEmail: 'anna@envi' }))
        ).toContain('E-mail systemowy użytkownika FIDmana ma nieprawidłowy format.');
    });

    it('adres krótszy niż 6 znaków odbiłby się o min(6) w zod FIDmana', () => {
        expect(validateFidmanUserSource(source({ systemEmail: 'a@b.c' })).length)
            .toBeGreaterThan(0);
    });

    it.each([
        ['name', FIDMAN_USER_LIMITS.name, 'Imię użytkownika FIDmana może mieć maksymalnie 63 znaków.'],
        ['surname', FIDMAN_USER_LIMITS.surname, 'Nazwisko użytkownika FIDmana może mieć maksymalnie 32 znaków.'],
    ])('%s dłuższe niż kolumna FIDmana jest odrzucane, nie obcinane', (field, limit, message) => {
        const problems = validateFidmanUserSource(
            source({ [field]: 'x'.repeat((limit as number) + 1) } as any)
        );
        expect(problems).toContain(message);
    });

    it('dokładnie na limicie jeszcze przechodzi', () => {
        expect(
            validateFidmanUserSource(
                source({
                    name: 'x'.repeat(FIDMAN_USER_LIMITS.name),
                    surname: 'y'.repeat(FIDMAN_USER_LIMITS.surname),
                })
            )
        ).toEqual([]);
    });

    it('bez podmiotu FIDman nie ma czym ustawić entityid przy insercie', () => {
        expect(validateFidmanUserSource(source({ entityId: null }))).toContain(
            'Użytkownik FIDmana musi być przypisany do podmiotu.'
        );
    });

    it('brak imienia i nazwiska zbiera oba problemy naraz, nie tylko pierwszy', () => {
        const problems = validateFidmanUserSource(
            source({ name: '', surname: '' })
        );
        expect(problems).toEqual([
            'Użytkownik FIDmana musi mieć imię.',
            'Użytkownik FIDmana musi mieć nazwisko.',
        ]);
    });
});

describe('enqueueFidmanUserPush — wiersz outboxu w tej samej transakcji', () => {
    const conn = { execute: jest.fn() } as any;

    beforeEach(() => {
        conn.execute.mockReset();
        conn.execute.mockResolvedValue([{ insertId: 7788 }]);
    });

    it('pisze przez PRZEKAZANE połączenie i zwraca Id wiersza', async () => {
        const outboxId = await enqueueFidmanUserPush(source(), true, conn);

        expect(outboxId).toBe(7788);
        expect(conn.execute).toHaveBeenCalledTimes(1);
        const [sql, params] = conn.execute.mock.calls[0] as [string, any[]];
        expect(sql).toContain('INSERT INTO FidmanSyncOutbox');
        expect(sql).toContain("'PENDING'");
        expect(params[0]).toBe('user.upsert');
        // RefId = PS Persons.Id, tak jak RefId kontraktu = Contracts.Id.
        expect(params[1]).toBe(5150);
        expect(JSON.parse(params[2])).toMatchObject({
            legacyPersonId: 5150,
            enabled: true,
        });
    });

    it('wyłączenie też idzie wierszem outboxu, nie osobną drogą', async () => {
        await enqueueFidmanUserPush(source(), false, conn);
        const params = conn.execute.mock.calls[0][1] as any[];
        expect(JSON.parse(params[2]).enabled).toBe(false);
    });
});

describe('fidmanSkipReasonLabel — powody pominięcia użytkownika po polsku', () => {
    it.each([
        'EMAIL_AMBIGUOUS',
        'ENTITY_NOT_IN_FIDMAN',
        'LAST_STARTUP_USER',
        'GOOGLE_EMAIL_TAKEN',
    ])('%s ma własne zdanie, a nie „Nieznany powód"', (reason) => {
        const label = fidmanSkipReasonLabel(reason);
        expect(label).toBeTruthy();
        expect(label).not.toContain('Nieznany powód');
    });

    it('powody sprzed GLO-P1 nadal działają', () => {
        expect(fidmanSkipReasonLabel('NO_NIP')).toContain('NIP');
        expect(fidmanSkipReasonLabel(null)).toBeNull();
    });
});
