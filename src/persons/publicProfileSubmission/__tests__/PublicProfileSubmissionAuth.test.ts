import { ensureStaffAccess } from '../PublicProfileSubmissionAuth';

describe('PublicProfileSubmissionAuth', () => {
    it('returns user id for staff roles', () => {
        const req = {
            session: {
                userData: {
                    enviId: 12,
                    systemRoleName: 'ENVI_EMPLOYEE',
                },
            },
        } as any;

        expect(ensureStaffAccess(req)).toBe(12);
    });

    it('throws for missing session user', () => {
        const req = { session: {} } as any;

        expect(() => ensureStaffAccess(req)).toThrow('Forbidden');
    });
});
