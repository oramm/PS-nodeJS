/// <reference types="jest" />
import { describe, expect, it } from '@jest/globals';
import AbsenceTypeValidator from '../AbsenceTypeValidator';
import { BadRequestError } from '../../../persons/projectAssignments/ProjectScopeGuard';

describe('AbsenceTypeValidator', () => {
    it('ustawia domyślny kolor, gdy nie podano', () => {
        const result = AbsenceTypeValidator.validateCreatePayload({
            name: 'Szkolenie',
        });
        expect(result.color).toBe('#0d6efd');
    });

    it('domyślnie schodzi z limitu urlopu, ale nie z puli opieki ani za święta', () => {
        const result = AbsenceTypeValidator.validateCreatePayload({
            name: 'Szkolenie',
        });
        expect(result.countsAgainstLimit).toBe(true);
        expect(result.countsAsCare).toBe(false);
        expect(result.countsAsHoliday).toBe(false);
    });

    it('przenosi flagę puli za święta z payloadu', () => {
        const result = AbsenceTypeValidator.validateCreatePayload({
            name: 'Wolne za święto',
            countsAgainstLimit: false,
            countsAsHoliday: true,
        });
        expect(result.countsAsHoliday).toBe(true);
        expect(result.countsAgainstLimit).toBe(false);
    });

    it.each([['0d6efd'], ['#0d6ef'], ['niebieski'], ['#0d6efdff']])(
        'odrzuca kolor %p spoza formatu szesnastkowego',
        (color) => {
            expect(() =>
                AbsenceTypeValidator.validateCreatePayload({
                    name: 'Szkolenie',
                    color,
                })
            ).toThrow(/szesnastkowych/);
        }
    );

    it('wymaga nazwy i pilnuje limitu 60 znaków', () => {
        expect(() => AbsenceTypeValidator.validateCreatePayload({})).toThrow(
            /Nazwa typu jest wymagana/
        );
        expect(() =>
            AbsenceTypeValidator.validateCreatePayload({ name: 'x'.repeat(61) })
        ).toThrow(/60 znaków/);
    });

    it('rzuca BadRequestError ze statusem 400', () => {
        try {
            AbsenceTypeValidator.validateCreatePayload({});
        } catch (error) {
            expect(error).toBeInstanceOf(BadRequestError);
            expect((error as any).status).toBe(400);
        }
    });

    it('edycja wymaga poprawnego identyfikatora', () => {
        expect(() =>
            AbsenceTypeValidator.validateUpdatePayload({ name: 'Szkolenie' })
        ).toThrow(/identyfikator/);
        expect(
            AbsenceTypeValidator.validateUpdatePayload({
                name: 'Szkolenie',
                id: '3',
            }).id
        ).toBe(3);
    });

    it.each([
        [{ countsAgainstLimit: true, countsAsCare: true }],
        [{ countsAgainstLimit: true, countsAsHoliday: true }],
        [{ countsAgainstLimit: false, countsAsCare: true, countsAsHoliday: true }],
    ])('odrzuca typ schodzący z dwóch pul naraz: %o', (flags) => {
        expect(() =>
            AbsenceTypeValidator.validateCreatePayload({
                name: 'Dziwny typ',
                ...flags,
            })
        ).toThrow(/najwyżej z jednej puli/);
    });

    it('sama pula za święta przechodzi, gdy limit urlopu wyłączony', () => {
        const result = AbsenceTypeValidator.validateCreatePayload({
            name: 'Wolne za święto',
            countsAgainstLimit: false,
            countsAsHoliday: true,
        });
        expect(result.countsAsHoliday).toBe(true);
        expect(result.countsAgainstLimit).toBe(false);
        expect(result.countsAsCare).toBe(false);
    });

    it('wskazanie innej puli wyłącza domyślny limit urlopu, zamiast robić konflikt', () => {
        const result = AbsenceTypeValidator.validateCreatePayload({
            name: 'Opieka',
            countsAsCare: true,
        });
        expect(result.countsAsCare).toBe(true);
        expect(result.countsAgainstLimit).toBe(false);
    });

    it('ale jawny konflikt nadal jest błędem', () => {
        expect(() =>
            AbsenceTypeValidator.validateCreatePayload({
                name: 'Opieka',
                countsAgainstLimit: true,
                countsAsCare: true,
            })
        ).toThrow(/najwyżej z jednej puli/);
    });
});

describe('AbsenceTypeValidator - flaga „można brać na godziny"', () => {
    it('domyślnie WOLNO brać na godziny, tak jak stoi kolumna w bazie', () => {
        expect(
            AbsenceTypeValidator.validateCreatePayload({ name: 'Szkolenie' })
                .allowsPartialDay
        ).toBe(true);
    });

    it('zdjęta kratka w panelu trafia do payloadu jako false', () => {
        expect(
            AbsenceTypeValidator.validateCreatePayload({
                name: 'L4',
                countsAgainstLimit: false,
                allowsPartialDay: false,
            }).allowsPartialDay
        ).toBe(false);
    });

    it('ta sama flaga przechodzi przy edycji', () => {
        const result = AbsenceTypeValidator.validateUpdatePayload({
            id: 5,
            name: 'L4',
            countsAgainstLimit: false,
            allowsPartialDay: false,
        });
        expect(result.id).toBe(5);
        expect(result.allowsPartialDay).toBe(false);
    });

    it('flaga jest niezależna od puli - typ bez puli może chodzić na godziny', () => {
        const result = AbsenceTypeValidator.validateCreatePayload({
            name: 'Bezpłatny',
            countsAgainstLimit: false,
            allowsPartialDay: true,
        });
        expect(result.countsAgainstLimit).toBe(false);
        expect(result.countsAsCare).toBe(false);
        expect(result.countsAsHoliday).toBe(false);
        expect(result.allowsPartialDay).toBe(true);
    });

    it('nie ma zaszytej reguły „L4 zawsze na całe dni" - decyduje owner, nie kod', () => {
        expect(
            AbsenceTypeValidator.validateCreatePayload({
                name: 'L4',
                countsAgainstLimit: false,
                allowsPartialDay: true,
            }).allowsPartialDay
        ).toBe(true);
    });
});
