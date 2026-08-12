/// <reference types="jest" />
import { describe, expect, it, jest } from '@jest/globals';
import adminPanelGuard, { hasAdminPanelAccess } from '../adminPanelGuard';
import { SystemRoleName } from '../../types/sessionTypes';

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

describe('adminPanelGuard', () => {
    it('odrzuca niezalogowanego kodem 401', () => {
        const res = makeRes();
        const next = jest.fn();

        adminPanelGuard(makeReq(), res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it.each([
        SystemRoleName.ENVI_EMPLOYEE,
        SystemRoleName.ENVI_COOPERATOR,
        SystemRoleName.EXTERNAL_USER,
        SystemRoleName.CONTRACT_WORKER,
        SystemRoleName.CLIENT,
    ])('odrzuca rolę %s kodem 403', (role) => {
        const res = makeRes();
        const next = jest.fn();

        adminPanelGuard(makeReq(role), res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it.each([SystemRoleName.ADMIN, SystemRoleName.ENVI_MANAGER])(
        'przepuszcza rolę %s',
        (role) => {
            const res = makeRes();
            const next = jest.fn();

            adminPanelGuard(makeReq(role), res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        }
    );

    it('hasAdminPanelAccess odpowiada bez rzucania dla braku sesji', () => {
        expect(hasAdminPanelAccess({ session: undefined } as any)).toBe(false);
        expect(hasAdminPanelAccess(makeReq(SystemRoleName.ADMIN))).toBe(true);
    });
});
