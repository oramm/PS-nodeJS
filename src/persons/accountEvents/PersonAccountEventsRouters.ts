import { app } from '../../index';
import { NextFunction, Request, Response } from 'express';
import requireUserManagementRole from '../../setup/Sessions/requireUserManagementRole';
import PersonAccountEventsController from './PersonAccountEventsController';
import PersonAccountEventValidator from './PersonAccountEventValidator';

/**
 * ROD-3: historia zmian konta osoby - kto, kiedy, co.
 * Za tą samą bramką co trasy konta (ADMIN, ENVI_MANAGER): kto może zmieniać konto, ten widzi,
 * kto je zmieniał. Zapisu przez HTTP nie ma celowo - zdarzenia pisze wyłącznie kontroler
 * w transakcji zmiany konta (PersonsController, StaffMembersController, ProjectAssignmentsController).
 *
 * Query: limit (opcjonalnie, domyślnie 50 ostatnich)
 * Returns: PersonAccountEventData[] (najnowsze pierwsze), z imieniem i nazwiskiem autora.
 */
app.get(
    '/v2/persons/:personId/account-events',
    requireUserManagementRole,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const personId = PersonAccountEventValidator.requirePersonId(
                req.params.personId,
            );
            const limit = PersonAccountEventValidator.optionalLimit(
                req.parsedQuery?.limit ?? req.query?.limit,
            );
            const events = await PersonAccountEventsController.find(
                personId,
                limit,
            );
            res.send(events);
        } catch (error) {
            next(error);
        }
    },
);
