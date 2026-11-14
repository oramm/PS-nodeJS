import { app } from '../../index';
import { NextFunction, Request, Response } from 'express';
import AccessOverviewController from './AccessOverviewController';
import { BadRequestError } from '../projectAssignments/ProjectScopeGuard';
// Przegląd widzi ten, kto nadaje uprawnienia - ta sama bramka co konto i przypisania (okno „Personel i uprawnienia").
import requireUserManagementRole from '../../setup/Sessions/requireUserManagementRole';

const positiveInt = (raw: unknown, name: string): number => {
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) throw new BadRequestError(`${name} must be a positive integer`);
    return value;
};

/** Returns: { persons: PersonAccessView[] } - każda osoba, która może się zalogować. */
app.get('/v2/access-overview', requireUserManagementRole, async (_req: Request, res: Response, next: NextFunction) => {
    try {
        res.send({ persons: await AccessOverviewController.list() });
    } catch (error) {
        next(error);
    }
});

/**
 * Podgląd przed zapisem. Body: { personId?, systemRoleId, projectOurIds: string[] }; bez personId = nowa osoba.
 * Returns: { areas: AreaAccess[] }. Niczego nie zapisuje.
 */
app.post('/v2/access-overview/preview', requireUserManagementRole, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const body = req.parsedBody ?? req.body ?? {};
        if (!Array.isArray(body.projectOurIds)) throw new BadRequestError('projectOurIds must be an array');
        const projectOurIds = [...new Set(body.projectOurIds.map((id: unknown) => String(id ?? '').trim()).filter(Boolean))] as string[];
        res.send({
            areas: await AccessOverviewController.preview(
                body.personId ? positiveInt(body.personId, 'personId') : 0, positiveInt(body.systemRoleId, 'systemRoleId'), projectOurIds),
        });
    } catch (error) {
        next(error);
    }
});

/** Returns: { person: PersonAccessView | null } - null, gdy osoba nie może się zalogować. */
app.get('/v2/access-overview/:personId', requireUserManagementRole, async (req: Request, res: Response, next: NextFunction) => {
    try {
        res.send({ person: await AccessOverviewController.get(positiveInt(req.params.personId, 'personId')) });
    } catch (error) {
        next(error);
    }
});
