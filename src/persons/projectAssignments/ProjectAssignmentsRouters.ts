import { app } from '../../index';
import { Request, Response, NextFunction } from 'express';
import { SystemRoleName } from '../../types/sessionTypes';
import ProjectAssignmentRepository from './ProjectAssignmentRepository';
import { BadRequestError } from './ProjectScopeGuard';

/** Przypisania nadaje ten, kto zarządza użytkownikami (ekran "Dodaj użytkownika"). */
const MANAGING_ROLES = [
    SystemRoleName.ADMIN,
    SystemRoleName.ENVI_MANAGER,
    SystemRoleName.ENVI_EMPLOYEE,
];

function requireUserManagementRole(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const role = req.session?.userData?.systemRoleName;
    if (!role || !MANAGING_ROLES.includes(role))
        return res.status(403).send({ errorMessage: 'Forbidden' });
    next();
}

const parsePersonId = (raw: string): number => {
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0)
        throw new BadRequestError('personId must be a positive integer');
    return value;
};

/**
 * Projekty przypisane osobie.
 * Returns: { assignments: { ourId, name }[] }
 */
app.get(
    '/v2/persons/:personId/project-assignments',
    requireUserManagementRole,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const personId = parsePersonId(req.params.personId);
            const assignments =
                await ProjectAssignmentRepository.getAssignedProjects(personId);
            res.send({ assignments });
        } catch (error) {
            next(error);
        }
    }
);

/**
 * Ustawia komplet przypisań osoby (replace-all).
 * Body: { projectOurIds: string[] }
 * Returns: { assignments: { ourId, name }[] }
 */
app.put(
    '/v2/persons/:personId/project-assignments',
    requireUserManagementRole,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const personId = parsePersonId(req.params.personId);
            const raw = req.parsedBody?.projectOurIds ?? req.body?.projectOurIds;
            if (!Array.isArray(raw))
                throw new BadRequestError('projectOurIds must be an array');

            const requested = [
                ...new Set(
                    raw
                        .map((ourId: any) => String(ourId ?? '').trim())
                        .filter((ourId: string) => ourId.length > 0)
                ),
            ] as string[];

            // Nieistniejący projekt to błąd, a nie cicho pominięty wpis - inaczej
            // literówka w OurId zawęziłaby dostęp bez śladu.
            const existing =
                await ProjectAssignmentRepository.filterExistingProjectOurIds(
                    requested
                );
            const unknown = requested.filter((ourId) => !existing.includes(ourId));
            if (unknown.length > 0)
                throw new BadRequestError(
                    `Nieznane projekty: ${unknown.join(', ')}`
                );

            await ProjectAssignmentRepository.setAssignments(personId, requested);
            const assignments =
                await ProjectAssignmentRepository.getAssignedProjects(personId);
            res.send({ assignments });
        } catch (error) {
            next(error);
        }
    }
);
