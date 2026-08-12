/// <reference types="jest" />
import { describe, expect, it } from '@jest/globals';
import Setup from '../../../setup/Setup';
import {
    PROTECTED_CASE_TYPE_IDS,
    PROTECTED_CASE_TYPE_NAMES,
    PROTECTED_MILESTONE_TYPE_IDS,
    isCaseTypeNameLocked,
    isMilestoneTypeNameLocked,
} from '../protectedTypes';

describe('protectedTypes', () => {
    // Listy mają być WYPROWADZONE z Setup, nie przepisane obok. Gdyby ktoś dopisał
    // tam nową stałą, a tu zostawił kopię, panel pozwoliłby zmienić nazwę,
    // na której coś się opiera.
    it('bierze identyfikatory wprost z Setup', () => {
        expect(PROTECTED_MILESTONE_TYPE_IDS).toEqual(
            Object.values(Setup.MilestoneTypes)
        );
        expect(PROTECTED_CASE_TYPE_IDS).toEqual(Object.values(Setup.CaseTypes));
        expect(PROTECTED_CASE_TYPE_NAMES).toContain(
            Setup.ScrumBoard.bucketCaseTypeName
        );
    });

    it('blokuje nazwy typów kamieni rozpoznawanych po numerze', () => {
        expect(isMilestoneTypeNameLocked(Setup.MilestoneTypes.OURCONTRACT_ADMINISTRATION)).toBe(true);
        expect(isMilestoneTypeNameLocked(Setup.MilestoneTypes.OFFER_SUBMISSION)).toBe(true);
    });

    it('nie blokuje zwykłych typów kamieni', () => {
        const freeId = 9999;
        expect(PROTECTED_MILESTONE_TYPE_IDS).not.toContain(freeId);
        expect(isMilestoneTypeNameLocked(freeId)).toBe(false);
        expect(isMilestoneTypeNameLocked(undefined)).toBe(false);
    });

    it('blokuje typ sprawy rozpoznawany po numerze', () => {
        expect(isCaseTypeNameLocked(Setup.CaseTypes.SECURITY_GUARANTEE, 'ZNWU')).toBe(true);
    });

    // To groźniejszy przypadek niż numer: zmiana nazwy nie rzuca błędem,
    // tylko po cichu rozspójnia koszyk ofert.
    it('blokuje typ sprawy rozpoznawany po NAZWIE, niezależnie od numeru', () => {
        expect(isCaseTypeNameLocked(12345, Setup.ScrumBoard.bucketCaseTypeName)).toBe(true);
    });

    it('nie blokuje zwykłego typu sprawy', () => {
        expect(isCaseTypeNameLocked(12345, 'Korespondencja')).toBe(false);
        expect(isCaseTypeNameLocked(undefined, undefined)).toBe(false);
    });
});
