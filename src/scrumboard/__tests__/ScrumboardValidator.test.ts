/// <reference types="jest" />
import { describe, expect, it } from '@jest/globals';
import ScrumboardValidator from '../ScrumboardValidator';
import { BadRequestError } from '../../persons/projectAssignments/ProjectScopeGuard';

describe('ScrumboardValidator.parseVacationLimit', () => {
    it('czyta wszystkie cztery pule', () => {
        expect(
            ScrumboardValidator.parseVacationLimit({
                limitDays: 26,
                carryoverDays: 5,
                careDays: 2,
                holidayDays: 1,
            })
        ).toEqual({
            limitDays: 26,
            carryoverDays: 5,
            careDays: 2,
            holidayDays: 1,
        });
    });

    it('brak puli za święta to zero, nie błąd (wiersze sprzed migracji 004)', () => {
        expect(
            ScrumboardValidator.parseVacationLimit({ limitDays: 26 }).holidayDays
        ).toBe(0);
    });

    it.each([[-1], [367], ['dwa']])(
        'odrzuca %p jako pulę za święta',
        (holidayDays) => {
            expect(() =>
                ScrumboardValidator.parseVacationLimit({
                    limitDays: 26,
                    holidayDays,
                })
            ).toThrow(/holidayDays/);
        }
    );
});

describe('ScrumboardValidator.parseAbsenceCreate - granica roku', () => {
    const payload = (dateFrom: string, dateTo: string) => ({
        personId: 1,
        typeId: 2,
        dateFrom,
        dateTo,
    });

    it('przepuszcza zakres w jednym roku', () => {
        const result = ScrumboardValidator.parseAbsenceCreate(
            payload('2026-12-28', '2026-12-31')
        );
        expect(result.dateFrom).toBe('2026-12-28');
        expect(result.dateTo).toBe('2026-12-31');
    });

    it('odrzuca zakres przez sylwestra - pule rozliczają się rocznikami', () => {
        expect(() =>
            ScrumboardValidator.parseAbsenceCreate(
                payload('2026-12-28', '2027-01-05')
            )
        ).toThrow(/przełomie roku/);
    });

    it('ta sama bramka działa przy edycji, nie tylko przy tworzeniu', () => {
        expect(() =>
            ScrumboardValidator.parseAbsenceEdit({
                typeId: 2,
                dateFrom: '2026-12-31',
                dateTo: '2027-01-01',
            })
        ).toThrow(/przełomie roku/);
    });

    it('błąd wejścia to 400, nie awaria serwera z mailem do zespołu', () => {
        try {
            ScrumboardValidator.parseAbsenceCreate(
                payload('2026-12-28', '2027-01-05')
            );
            throw new Error('powinno rzucić');
        } catch (err) {
            expect(err).toBeInstanceOf(BadRequestError);
            expect((err as BadRequestError).status).toBe(400);
        }
    });
});

describe('ScrumboardValidator - godziny (część dnia)', () => {
    const base = {
        personId: 1,
        typeId: 4,
        dateFrom: '2026-09-18', // piątek
        dateTo: '2026-09-18',
    };

    it('brak godzin to cały dzień - zachowanie sprzed packa GOD', () => {
        const result = ScrumboardValidator.parseAbsenceCreate(base);
        expect(result.startTime).toBeNull();
        expect(result.endTime).toBeNull();
    });

    it('puste łańcuchy też znaczą cały dzień', () => {
        const result = ScrumboardValidator.parseAbsenceCreate({
            ...base,
            startTime: '',
            endTime: '',
        });
        expect(result.startTime).toBeNull();
        expect(result.endTime).toBeNull();
    });

    it('przepuszcza cztery godziny opieki w dzień roboczy', () => {
        const result = ScrumboardValidator.parseAbsenceCreate({
            ...base,
            startTime: '08:00',
            endTime: '12:00',
        });
        expect(result.startTime).toBe('08:00');
        expect(result.endTime).toBe('12:00');
    });

    it('sama godzina początkowa to za mało', () => {
        expect(() =>
            ScrumboardValidator.parseAbsenceCreate({ ...base, startTime: '08:00' })
        ).toThrow(/Podaj obie godziny/);
    });

    it('godziny przy zakresie wielodniowym są odrzucane', () => {
        expect(() =>
            ScrumboardValidator.parseAbsenceCreate({
                ...base,
                dateTo: '2026-09-21',
                startTime: '08:00',
                endTime: '12:00',
            })
        ).toThrow('Część dnia wpisz na jeden dzień — podaj tę samą datę początkową i końcową.');
    });

    it('godziny w sobotę są odrzucane - nie ma z czego odjąć', () => {
        expect(() =>
            ScrumboardValidator.parseAbsenceCreate({
                ...base,
                dateFrom: '2026-09-19',
                dateTo: '2026-09-19',
                startTime: '08:00',
                endTime: '12:00',
            })
        ).toThrow('To dzień wolny — nieobecności godzinowej nie ma z czego odjąć.');
    });

    it.each([
        ['12:00', '08:00'],
        ['08:00', '08:00'],
    ])('godzina końcowa %p przed początkową %p jest odrzucana', (start, end) => {
        expect(() =>
            ScrumboardValidator.parseAbsenceCreate({
                ...base,
                startTime: start,
                endTime: end,
            })
        ).toThrow('Godzina końcowa musi być późniejsza niż początkowa.');
    });

    it('osiem godzin to już cały dzień pracy', () => {
        expect(() =>
            ScrumboardValidator.parseAbsenceCreate({
                ...base,
                startTime: '08:00',
                endTime: '16:00',
            })
        ).toThrow('To cały dzień pracy — przełącz na tryb «Całe dni».');
    });

    it('siedem godzin jeszcze przechodzi - to ostatnia dozwolona długość', () => {
        expect(
            ScrumboardValidator.parseAbsenceCreate({
                ...base,
                startTime: '08:00',
                endTime: '15:00',
            }).endTime
        ).toBe('15:00');
    });

    it.each([
        ['08:30', '12:00'],
        ['08:00', '12:15'],
        ['08:45', '12:45'],
    ])('odrzuca godziny z minutami: %s - %s', (start, end) => {
        expect(() =>
            ScrumboardValidator.parseAbsenceCreate({
                ...base,
                startTime: start,
                endTime: end,
            })
        ).toThrow('Nieobecność godzinową wpisuje się w pełnych godzinach — bez minut.');
    });

    it('te same bramki działają przy edycji, nie tylko przy tworzeniu', () => {
        expect(() =>
            ScrumboardValidator.parseAbsenceEdit({
                typeId: 4,
                dateFrom: '2026-09-18',
                dateTo: '2026-09-21',
                startTime: '08:00',
                endTime: '12:00',
            })
        ).toThrow(/jeden dzień/);
    });

    it.each([
        [{ startTime: '08:00' }],
        [{ dateTo: '2026-09-21', startTime: '08:00', endTime: '12:00' }],
        [{ dateFrom: '2026-09-19', dateTo: '2026-09-19', startTime: '08:00', endTime: '12:00' }],
        [{ startTime: '12:00', endTime: '08:00' }],
        [{ startTime: '08:00', endTime: '16:00' }],
        [{ startTime: '08:30', endTime: '12:00' }],
        [{ startTime: 'rano', endTime: '12:00' }],
    ])('odrzucenie %p wychodzi jako 400, nie jako awaria serwera', (extra) => {
        try {
            ScrumboardValidator.parseAbsenceCreate({ ...base, ...extra });
            throw new Error('powinno rzucić');
        } catch (err) {
            expect(err).toBeInstanceOf(BadRequestError);
            expect((err as BadRequestError).status).toBe(400);
        }
    });

    it('zła data też jest błędem wejścia, a nie awarią serwera', () => {
        try {
            ScrumboardValidator.parseAbsenceCreate({ ...base, dateFrom: '2026-02-31' });
            throw new Error('powinno rzucić');
        } catch (err) {
            expect(err).toBeInstanceOf(BadRequestError);
        }
    });
});
