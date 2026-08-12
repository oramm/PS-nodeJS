/// <reference types="jest" />
import { describe, expect, it } from '@jest/globals';
import CarValidator from '../CarValidator';
import { BadRequestError } from '../../../persons/projectAssignments/ProjectScopeGuard';

describe('CarValidator', () => {
    const valid = { brand: 'Ford', model: 'Focus', licensePlateNumber: 'op 1001a' };

    it('normalizuje numer rejestracyjny do wielkich liter i pojedynczych spacji', () => {
        const result = CarValidator.validateCreatePayload({
            ...valid,
            licensePlateNumber: '  op   1001a ',
        });
        expect(result.licensePlateNumber).toBe('OP 1001A');
    });

    it('domyślnie ustawia auto jako aktywne', () => {
        expect(CarValidator.validateCreatePayload(valid).isActive).toBe(true);
    });

    it('zamienia puste pola opcjonalne na null zamiast pustego tekstu', () => {
        const result = CarValidator.validateCreatePayload({
            ...valid,
            comment: '',
            mileageSpreadsheetId: '',
        });
        expect(result.comment).toBeNull();
        expect(result.mileageSpreadsheetId).toBeNull();
    });

    it('rzuca BadRequestError (400), a nie zwykłego Error', () => {
        expect(() => CarValidator.validateCreatePayload({})).toThrow(
            BadRequestError
        );
        try {
            CarValidator.validateCreatePayload({});
        } catch (error) {
            expect((error as any).status).toBe(400);
        }
    });

    it('wymaga marki, modelu i numeru rejestracyjnego', () => {
        expect(() =>
            CarValidator.validateCreatePayload({ model: 'Focus', licensePlateNumber: 'OP 1' })
        ).toThrow(/Marka/);
        expect(() =>
            CarValidator.validateCreatePayload({ brand: 'Ford', model: 'Focus' })
        ).toThrow(/Numer rejestracyjny/);
        expect(() =>
            CarValidator.validateCreatePayload({ brand: 'Ford', licensePlateNumber: 'OP 1' })
        ).toThrow(/Model/);
        expect(() =>
            CarValidator.validateCreatePayload({ ...valid, model: '   ' })
        ).toThrow(/Model/);
    });

    it('pilnuje limitów długości kolumn', () => {
        expect(() =>
            CarValidator.validateCreatePayload({
                ...valid,
                brand: 'x'.repeat(51),
            })
        ).toThrow(/50 znaków/);
        expect(() =>
            CarValidator.validateCreatePayload({
                ...valid,
                licensePlateNumber: 'x'.repeat(16),
            })
        ).toThrow(/15 znaków/);
    });

    // Tools.parseObjectsJSON woła JSON.parse na każdym polu ciała żądania,
    // więc model "3" dociera do walidatora jako liczba.
    it('przyjmuje czysto liczbowy model, np. Mazda 3', () => {
        const result = CarValidator.validateCreatePayload({
            ...valid,
            brand: 'Mazda',
            model: 3,
        });
        expect(result.model).toBe('3');
    });

    it('odrzuca niecałkowity numer zakładki arkusza', () => {
        expect(() =>
            CarValidator.validateCreatePayload({
                ...valid,
                mileageSheetGid: 'abc',
            })
        ).toThrow(/liczbą całkowitą/);
    });

    it('edycja wymaga poprawnego identyfikatora', () => {
        expect(() => CarValidator.validateUpdatePayload(valid)).toThrow(
            /identyfikator/
        );
        expect(
            CarValidator.validateUpdatePayload({ ...valid, id: '7' }).id
        ).toBe(7);
        expect(() =>
            CarValidator.validateUpdatePayload({ ...valid, id: 0 })
        ).toThrow(/identyfikator/);
    });
});
