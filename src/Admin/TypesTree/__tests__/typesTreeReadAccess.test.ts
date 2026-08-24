/// <reference types="jest" />
import { describe, expect, it } from '@jest/globals';
import { hasTypesTreeReadAccess } from '../typesTreeReadAccess';
import { SystemRoleName } from '../../../types/sessionTypes';

const req = (systemRoleName?: SystemRoleName) =>
    (systemRoleName ? { session: { userData: { systemRoleName } } } : { session: {} }) as any;

describe('hasTypesTreeReadAccess', () => {
    it('wpuszcza wszystkich pracownikow ENVI, nie tylko panel administracyjny', () => {
        expect(hasTypesTreeReadAccess(req(SystemRoleName.ADMIN))).toBe(true);
        expect(hasTypesTreeReadAccess(req(SystemRoleName.ENVI_MANAGER))).toBe(true);
        expect(hasTypesTreeReadAccess(req(SystemRoleName.ENVI_EMPLOYEE))).toBe(true);
    });

    it('nie wpuszcza rol spoza ENVI ani niezalogowanego', () => {
        expect(hasTypesTreeReadAccess(req(SystemRoleName.ENVI_COOPERATOR))).toBe(false);
        expect(hasTypesTreeReadAccess(req(SystemRoleName.EXTERNAL_USER))).toBe(false);
        expect(hasTypesTreeReadAccess(req(SystemRoleName.CONTRACT_WORKER))).toBe(false);
        expect(hasTypesTreeReadAccess(req(SystemRoleName.CLIENT))).toBe(false);
        expect(hasTypesTreeReadAccess(req())).toBe(false);
    });
});
