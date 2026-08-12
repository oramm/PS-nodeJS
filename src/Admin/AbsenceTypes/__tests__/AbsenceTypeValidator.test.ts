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

    it('domyślnie schodzi z limitu urlopu, ale nie z puli opieki', () => {
        const result = AbsenceTypeValidator.validateCreatePayload({
            name: 'Szkolenie',
        });
        expect(result.countsAgainstLimit).toBe(true);
        expect(result.countsAsCare).toBe(false);
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
});
