/// <reference types="jest" />
/**
 * Rachunek nieobecności na część dnia. Jednostką jest MINUTA, nie ułamek dnia.
 * Najważniejszy test w tym pliku to kontrola negatywna: dla samych całych dni
 * nowy rachunek musi dać liczby identyczne jak stary countWeekdays.
 */
import { describe, expect, it } from '@jest/globals';
import {
    MINUTES_PER_DAY,
    countWeekdays,
    countWorkMinutes,
    countWorkMinutesInWindow,
    daysToMinutes,
    dbTimeToStr,
    formatAbsenceTerm,
    formatDays,
    minutesToDays,
    parseTimeOnly,
    timeToMinutes,
} from '../vacations/vacationDateUtils';

describe('kontrola negatywna: całe dni liczą się tak jak przed zmianą', () => {
    // 2026-09-01 to wtorek; zakresy dobrane tak, by objąć weekendy i pojedyncze dni
    const ranges: [string, string][] = [
        ['2026-09-01', '2026-09-01'],
        ['2026-09-01', '2026-09-04'],
        ['2026-09-01', '2026-09-30'],
        ['2026-09-04', '2026-09-07'], // pt -> pon, po drodze weekend
        ['2026-09-05', '2026-09-06'], // sam weekend
        ['2026-06-29', '2026-07-07'], // zakres z prawdziwych danych
    ];

    it.each(ranges)(
        'zakres %s..%s daje tę samą liczbę dni co countWeekdays',
        (from, to) => {
            const dni = minutesToDays(countWorkMinutes(from, to, null, null));
            expect(dni).toBe(countWeekdays(from, to));
            expect(Number.isInteger(dni)).toBe(true);
        }
    );

    it('okno rozliczeniowe też liczy się tak jak przed zmianą', () => {
        const minuty = countWorkMinutesInWindow(
            '2026-06-29',
            '2026-07-07',
            null,
            null,
            '2026-07-01',
            '2026-07-31'
        );
        expect(minutesToDays(minuty)).toBe(5); // 1-7 lipca to 5 dni roboczych
    });
});

describe('minuty i dni', () => {
    it('dzień pracy ma 480 minut (8 h = 1 dzień)', () => {
        expect(MINUTES_PER_DAY).toBe(480);
    });

    it.each([
        [240, 0.5],
        [480, 1],
        [48, 0.1],
        [120, 0.25],
        [0, 0],
    ])('%i minut to %s dnia', (minuty, dni) => {
        expect(minutesToDays(minuty)).toBe(dni);
    });

    it.each([
        [0.1, 48],
        [0.5, 240],
        [2.5, 1200],
        [26, 12480],
    ])('%s dnia to %i minut, zawsze całkowitych', (dni, minuty) => {
        expect(daysToMinutes(dni)).toBe(minuty);
        expect(Number.isInteger(daysToMinutes(dni))).toBe(true);
    });

    it('dziesięć nieobecności po 0,1 dnia daje dokładnie 1 dzień, nie 0,9999...', () => {
        const wMinutach = Array(10)
            .fill(daysToMinutes(0.1))
            .reduce((a: number, b: number) => a + b, 0);
        expect(minutesToDays(wMinutach)).toBe(1);

        // dla kontrastu: ten sam rachunek na ułamkach dnia dryfuje
        const wUlamkach = Array(10)
            .fill(0.1)
            .reduce((a: number, b: number) => a + b, 0);
        expect(wUlamkach).not.toBe(1);
    });
});

describe('countWorkMinutes dla części dnia', () => {
    it('cztery godziny opieki to pół dnia', () => {
        const minuty = countWorkMinutes(
            '2026-09-18',
            '2026-09-18',
            '08:00',
            '12:00'
        );
        expect(minuty).toBe(240);
        expect(minutesToDays(minuty)).toBe(0.5);
    });

    it('godzina to 0,13 dnia po zaokrągleniu do dwóch miejsc', () => {
        expect(
            minutesToDays(
                countWorkMinutes('2026-09-18', '2026-09-18', '08:00', '09:00')
            )
        ).toBe(0.13);
    });

    it('część dnia w sobotę daje zero minut (bramka jest w walidatorze)', () => {
        expect(
            countWorkMinutes('2026-09-05', '2026-09-05', '08:00', '12:00')
        ).toBe(0);
    });

    it('część dnia poza oknem rozliczeniowym nie schodzi z niczego', () => {
        expect(
            countWorkMinutesInWindow(
                '2026-09-18',
                '2026-09-18',
                '08:00',
                '12:00',
                '2026-10-01',
                '2026-10-31'
            )
        ).toBe(0);
    });

    it('część dnia wewnątrz okna schodzi w całości', () => {
        expect(
            countWorkMinutesInWindow(
                '2026-09-18',
                '2026-09-18',
                '08:00',
                '12:00',
                '2026-09-01',
                '2026-09-30'
            )
        ).toBe(240);
    });
});

describe('godziny: parsowanie i odczyt z bazy', () => {
    it.each([
        ['08:00', '08:00'],
        ['08:00:00', '08:00'],
        ['23:59', '23:59'],
        [' 07:30 ', '07:30'],
    ])('przyjmuje %p i normalizuje do %p', (wejscie, wynik) => {
        expect(parseTimeOnly(wejscie)).toBe(wynik);
    });

    it.each([['8:00'], ['24:00'], ['12:60'], ['południe'], [null], [830]])(
        'odrzuca %p',
        (wejscie) => {
            expect(() => parseTimeOnly(wejscie)).toThrow(/HH:MM/);
        }
    );

    it('kolumna TIME z bazy przychodzi jako tekst i skraca się do HH:MM', () => {
        expect(dbTimeToStr('08:30:00')).toBe('08:30');
    });

    it('pusta kolumna TIME zostaje nullem, czyli całym dniem', () => {
        expect(dbTimeToStr(null)).toBeNull();
        expect(dbTimeToStr(undefined)).toBeNull();
    });

    it('timeToMinutes liczy od północy', () => {
        expect(timeToMinutes('00:00')).toBe(0);
        expect(timeToMinutes('08:30')).toBe(510);
    });
});

describe('formatowanie dla człowieka', () => {
    it.each([
        [1.5, '1,5'],
        [26, '26'],
        [0.25, '0,25'],
        [0, '0'],
        [10, '10'],
    ])('%s dnia zapisujemy jako %p', (dni, tekst) => {
        expect(formatDays(dni)).toBe(tekst);
    });

    it('jeden dzień: "18 września"', () => {
        expect(formatAbsenceTerm('2026-09-18', '2026-09-18')).toBe(
            '18 września'
        );
    });

    it('zakres w jednym miesiącu: "14–16 września"', () => {
        expect(formatAbsenceTerm('2026-09-14', '2026-09-16')).toBe(
            '14–16 września'
        );
    });

    it('zakres przez granicę miesiąca podaje oba miesiące', () => {
        expect(formatAbsenceTerm('2026-09-28', '2026-10-02')).toBe(
            '28 września – 2 października'
        );
    });
});
