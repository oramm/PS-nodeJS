/// <reference types="jest" />
import { describe, expect, it, jest } from '@jest/globals';
import requireUserManagementRole, {
    requireStaffRole,
    USER_MANAGEMENT_ROLES,
    STAFF_ROLES,
} from '../requireUserManagementRole';
import { SystemRoleName } from '../../../types/sessionTypes';

function makeReq(systemRoleName?: SystemRoleName) {
    return systemRoleName
        ? ({ session: { userData: { systemRoleName } } } as any)
        : ({ session: {} } as any);
}

function makeRes() {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
}

describe('requireUserManagementRole', () => {
    it('odrzuca niezalogowanego kodem 401', () => {
        const res = makeRes();
        const next = jest.fn();

        requireUserManagementRole(makeReq(), res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    // Sedno PER-2: dokładnie te role mogły do tej pory nadać sobie ADMIN bezpośrednim
    // żądaniem na trasę konta, z pominięciem ekranu.
    // ENVI_EMPLOYEE dołączył w PER-3 (D-PER-3 (a)): konta zmienia się wyłącznie z okna
    // panelu administracyjnego, a ono jest dla ADMIN i ENVI_MANAGER.
    it.each([
        SystemRoleName.ENVI_EMPLOYEE,
        SystemRoleName.ENVI_COOPERATOR,
        SystemRoleName.EXTERNAL_USER,
        SystemRoleName.CONTRACT_WORKER,
        SystemRoleName.CLIENT,
    ])('odrzuca rolę %s kodem 403 z komunikatem dla klienta', (role) => {
        const res = makeRes();
        const next = jest.fn();

        requireUserManagementRole(makeReq(role), res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.send).toHaveBeenCalledWith({
            errorMessage: 'Brak uprawnień do zarządzania kontami',
        });
        expect(next).not.toHaveBeenCalled();
    });

    it.each([SystemRoleName.ADMIN, SystemRoleName.ENVI_MANAGER])(
        'przepuszcza rolę %s',
        (role) => {
            const res = makeRes();
            const next = jest.fn();

            requireUserManagementRole(makeReq(role), res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        },
    );
});

describe('requireStaffRole', () => {
    it('odrzuca niezalogowanego kodem 401', () => {
        const res = makeRes();
        const next = jest.fn();

        requireStaffRole(makeReq(), res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it.each([
        SystemRoleName.ENVI_COOPERATOR,
        SystemRoleName.EXTERNAL_USER,
        SystemRoleName.CONTRACT_WORKER,
        SystemRoleName.CLIENT,
    ])('odrzuca rolę %s kodem 403', (role) => {
        const res = makeRes();
        const next = jest.fn();

        requireStaffRole(makeReq(role), res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it.each([
        SystemRoleName.ADMIN,
        SystemRoleName.ENVI_MANAGER,
        SystemRoleName.ENVI_EMPLOYEE,
    ])('przepuszcza rolę %s', (role) => {
        const res = makeRes();
        const next = jest.fn();

        requireStaffRole(makeReq(role), res, next);

        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });
});

describe('listy ról', () => {
    // Od PER-3 listy naprawdę się różnią: kontami zarządza panel administracyjny
    // (D-PER-3 (a)), książkę adresową prowadzi każdy pracownik ENVI. Ten test pilnuje,
    // żeby zawężenie jednej nie przeciekło na drugą przez wspólną stałą.
    it('trzyma osobne listy dla kont i dla osób', () => {
        expect(USER_MANAGEMENT_ROLES).not.toBe(STAFF_ROLES);
    });

    it('zarządzanie kontami zawężone do panelu administracyjnego, książka adresowa nie', () => {
        expect(USER_MANAGEMENT_ROLES).toEqual([
            SystemRoleName.ADMIN,
            SystemRoleName.ENVI_MANAGER,
        ]);
        expect(USER_MANAGEMENT_ROLES).not.toContain(
            SystemRoleName.ENVI_EMPLOYEE,
        );
        expect(STAFF_ROLES).toContain(SystemRoleName.ENVI_EMPLOYEE);
    });

    it('nie wpuszcza ról zewnętrznych na żadną z list', () => {
        for (const roles of [USER_MANAGEMENT_ROLES, STAFF_ROLES]) {
            expect(roles).not.toContain(SystemRoleName.ENVI_COOPERATOR);
            expect(roles).not.toContain(SystemRoleName.EXTERNAL_USER);
            expect(roles).not.toContain(SystemRoleName.CONTRACT_WORKER);
            expect(roles).not.toContain(SystemRoleName.CLIENT);
        }
    });
});
