import { app } from '../../index';
import { Request, Response, NextFunction } from 'express';
import ProjectAssignmentRepository from './ProjectAssignmentRepository';
import ProjectAssignmentsController from './ProjectAssignmentsController';
import { BadRequestError } from './ProjectScopeGuard';
/**
 * Przypisania nadaje ten, kto zarządza użytkownikami - ta sama lista ról co trasy konta.
 * Bramka mieszkała tu jako funkcja lokalna, przez co trasy konta nie dostały jej wcale
 * (PER-2); teraz jest jedna, wspólna.
 */
import requireUserManagementRole from '../../setup/Sessions/requireUserManagementRole';

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

            // ROD-3: walidacja istnienia projektów, podmiana przypisań i zdarzenie konta
            // (zakres przed/po, autor z sesji) idą przez kontroler, w jednej transakcji.
            const assignments =
                await ProjectAssignmentsController.replaceAssignments(
                    personId,
                    requested,
                    req.session?.userData?.enviId
                );
            res.send({ assignments });
        } catch (error) {
            next(error);
        }
    }
);
