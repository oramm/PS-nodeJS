/// <reference types="jest" />
import { describe, expect, it } from '@jest/globals';
import StaffMemberValidator from '../StaffMemberValidator';
import { BadRequestError } from '../../../persons/projectAssignments/ProjectScopeGuard';

const allFlags = {
    isDriver: true,
    isInScrum: false,
    hasCostInvoiceAccess: false,
    hasBankAccess: false,
    canLogSiteVisits: true,
    isActive: true,
};

describe('StaffMemberValidator', () => {
    it('przepuszcza komplet flag logicznych', () => {
        const result = StaffMemberValidator.validateUpdatePayload({
            personId: 42,
            ...allFlags,
        });
        expect(result.personId).toBe(42);
        expect(result.isDriver).toBe(true);
        expect(result.hasBankAccess).toBe(false);
    });

    // Te flagi sterują dostępem do faktur kosztowych i banku - niejawna konwersja
    // typu jest tu niedopuszczalna, bo 'false' jako string byłoby prawdziwe.
    it.each([['true'], [1], ['1'], [0], [null]])(
        'odrzuca wartość %p zamiast boolean',
        (value) => {
            expect(() =>
                StaffMemberValidator.validateUpdatePayload({
                    personId: 42,
                    ...allFlags,
                    hasBankAccess: value,
                })
            ).toThrow(/wartością logiczną/);
        }
    );

    it('wymaga kompletu flag - brak pola to błąd, nie ciche false', () => {
        const { hasBankAccess, ...incomplete } = allFlags;
        expect(() =>
            StaffMemberValidator.validateUpdatePayload({
                personId: 42,
                ...incomplete,
            })
        ).toThrow(/hasBankAccess/);
    });

    it('ignoruje pola spoza białej listy', () => {
        const result: any = StaffMemberValidator.validateUpdatePayload({
            personId: 42,
            ...allFlags,
            isSuperAdmin: true,
            id: 999,
        });
        expect(result.isSuperAdmin).toBeUndefined();
        expect(result.id).toBeUndefined();
    });

    it('ignoruje pola konta - rolę, e-mail systemowy i FIDmana zapisuje wyłącznie trasa konta v2', () => {
        // Klient wysyła cały wiersz scalony z formularzem, więc te pola przychodzą tu
        // przy każdym zapisie. Gdyby walidator je przepuścił, panel znów pisałby rolę
        // własną drogą - bez unieważnienia sesji i bez pusha do FIDmana.
        const result: any = StaffMemberValidator.validateUpdatePayload({
            personId: 42,
            ...allFlags,
            systemRoleId: 1,
            systemEmail: 'ktos@envi.com.pl',
            fidmanEnabled: true,
        });
        expect(result.systemRoleId).toBeUndefined();
        expect(result.systemEmail).toBeUndefined();
        expect(result.fidmanEnabled).toBeUndefined();
    });

    it('rzuca BadRequestError ze statusem 400', () => {
        expect(() =>
            StaffMemberValidator.validateUpdatePayload({ personId: 0 })
        ).toThrow(BadRequestError);
    });

    it('odrzuca nieprawidłowy identyfikator osoby', () => {
        expect(() => StaffMemberValidator.requirePersonId('abc')).toThrow(
            /identyfikator osoby/
        );
        expect(StaffMemberValidator.requirePersonId('42')).toBe(42);
    });
});
