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
