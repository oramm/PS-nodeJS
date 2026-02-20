import { Request } from 'express';
import { SystemRoleName } from '../../types/sessionTypes';
import {
    PublicProfileSubmissionError,
    PublicProfileSubmissionErrorCodes,
} from './PublicProfileSubmissionErrors';

const STAFF_ROLES = new Set<SystemRoleName>([
    SystemRoleName.ADMIN,
    SystemRoleName.ENVI_MANAGER,
    SystemRoleName.ENVI_EMPLOYEE,
    SystemRoleName.ENVI_COOPERATOR,
]);

export const ensureStaffAccess = (req: Request): number => {
    const userData = req.session?.userData;
    if (!userData || !STAFF_ROLES.has(userData.systemRoleName)) {
        throw new PublicProfileSubmissionError(
            'Forbidden',
            PublicProfileSubmissionErrorCodes.FORBIDDEN,
            403,
        );
    }
    return userData.enviId;
};

