import { app } from '../index';
import { Request, Response, NextFunction } from 'express';
import { SystemRoleName } from '../types/sessionTypes';
import ScrumboardEvents from './ScrumboardEvents';
import ScrumboardValidator from './ScrumboardValidator';
import ScrumboardContractStatusesController from './contractStatuses/ScrumboardContractStatusesController';
import ScrumboardTaskHoursController from './taskHours/ScrumboardTaskHoursController';
import ScrumboardPlanningController from './planning/ScrumboardPlanningController';
import ScrumboardSummaryController from './summary/ScrumboardSummaryController';
import ScrumboardReportController from './report/ScrumboardReportController';
import TasksController from '../contracts/milestones/cases/tasks/TasksController';
import { getScrumboardPersons } from './ScrumboardPersons';

/** Wymaga aktywnej sesji (routery domenowe nie mają guardów — tu dodajemy jawnie). */
function requireSession(req: Request, res: Response, next: NextFunction) {
    if (!req.session?.userData)
        return res.status(401).send({ errorMessage: 'Unauthorized' });
    next();
}

/** Wymaga roli ADMIN lub ENVI_MANAGER (akcje masowe / raport). */
function requireManagerOrAdmin(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const role = req.session?.userData?.systemRoleName;
    if (
        role !== SystemRoleName.ADMIN &&
        role !== SystemRoleName.ENVI_MANAGER
    )
        return res.status(403).send({ errorMessage: 'Forbidden' });
    next();
}

// ---- SSE ----
app.get('/scrumboard/events', requireSession, (req: Request, res: Response) => {
    ScrumboardEvents.subscribe(req, res);
});

// ---- Statusy omówienia ----
app.post(
    '/scrumboard/contractStatuses',
    requireSession,
    async (req: Request, res: Response, next) => {
        try {
            const result = await ScrumboardContractStatusesController.find();
            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);

app.put(
    '/scrumboard/contractStatus/:contractId',
    requireSession,
    async (req: Request, res: Response, next) => {
        try {
            const contractId = ScrumboardValidator.parseId(
                req.params.contractId,
                'contractId'
            );
            const discussed = ScrumboardValidator.parseDiscussed(
                req.parsedBody
            );
            const personId = req.session.userData?.enviId;
            const result =
                await ScrumboardContractStatusesController.setDiscussed(
                    contractId,
                    discussed,
                    personId
                );
            ScrumboardEvents.broadcast('contract-discussed-changed', {
                contractId,
                discussed,
                byPersonId: personId,
            });
            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);

app.post(
    '/scrumboard/contractStatuses/reset',
    requireSession,
    requireManagerOrAdmin,
    async (req: Request, res: Response, next) => {
        try {
            await ScrumboardContractStatusesController.resetAll();
            ScrumboardEvents.broadcast('discussed-reset', {});
            res.send({ ok: true });
        } catch (error) {
            next(error);
        }
    }
);

// ---- Godziny zadań (szac. czas + dzienne) ----
app.put(
    '/scrumboard/task/:id/hours',
    requireSession,
    async (req: Request, res: Response, next) => {
        try {
            const taskId = ScrumboardValidator.parseId(req.params.id, 'taskId');
            const payload = ScrumboardValidator.parseTaskHours(req.parsedBody);
            const result = await ScrumboardTaskHoursController.updateHours(
                taskId,
                payload
            );
            ScrumboardEvents.broadcast('task-hours-changed', {
                taskId,
                estimatedHours: result.estimatedHours,
                hoursMon: result.hoursMon,
                hoursTue: result.hoursTue,
                hoursWed: result.hoursWed,
                hoursThu: result.hoursThu,
                hoursFri: result.hoursFri,
                weekSum: result.weekSum,
            });
            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);

app.post(
    '/scrumboard/hours/reset',
    requireSession,
    requireManagerOrAdmin,
    async (req: Request, res: Response, next) => {
        try {
            await ScrumboardTaskHoursController.resetAllDailyHours();
            ScrumboardEvents.broadcast('hours-reset', {});
            res.send({ ok: true });
        } catch (error) {
            next(error);
        }
    }
);

// ---- Zmiana statusu zadania (deleguje do TasksController, zachowuje sync arkusza) ----
app.put(
    '/scrumboard/task/:id/status',
    requireSession,
    async (req: Request, res: Response, next) => {
        try {
            ScrumboardValidator.parseTaskStatus(req.parsedBody);
            const task = await TasksController.edit(req.parsedBody, ['status']);
            ScrumboardEvents.broadcast('task-status-changed', {
                taskId: task.id,
                status: task.status,
            });
            res.send(task);
        } catch (error) {
            next(error);
        }
    }
);

// ---- Osoby scrumboardu (pracownicy ENVI + manager z configu) ----
app.get(
    '/scrumboard/persons',
    requireSession,
    async (req: Request, res: Response, next) => {
        try {
            res.send(await getScrumboardPersons());
        } catch (error) {
            next(error);
        }
    }
);

// ---- Planowanie ----
app.get(
    '/scrumboard/planning',
    requireSession,
    async (req: Request, res: Response, next) => {
        try {
            const result =
                await ScrumboardPlanningController.getForScrumboardPersons();
            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);

app.put(
    '/scrumboard/planning/:personId',
    requireSession,
    async (req: Request, res: Response, next) => {
        try {
            const personId = ScrumboardValidator.parseId(
                req.params.personId,
                'personId'
            );
            const values = ScrumboardValidator.parsePlanning(req.parsedBody);
            const entry = await ScrumboardPlanningController.upsert(
                personId,
                values
            );
            ScrumboardEvents.broadcast('planning-changed', {
                personId,
                entry,
            });
            res.send(entry);
        } catch (error) {
            next(error);
        }
    }
);

// ---- Podsumowanie godzin ----
app.get(
    '/scrumboard/timesSummary',
    requireSession,
    async (req: Request, res: Response, next) => {
        try {
            const result = await ScrumboardSummaryController.getSummary();
            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);

// ---- Generowanie raportu ----
app.post(
    '/scrumboard/report',
    requireSession,
    requireManagerOrAdmin,
    async (req: Request, res: Response, next) => {
        try {
            const result = await ScrumboardReportController.generate();
            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);
