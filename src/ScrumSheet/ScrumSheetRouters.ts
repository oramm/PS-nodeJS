import { app } from '../index';
import { Request, Response, NextFunction } from 'express';
import ToolsGapi from '../setup/Sessions/ToolsGapi';
import Setup from '../setup/Setup';
import ScrumSheet from './ScrumSheet';
import CurrentSprint from './CurrentSprint';

/**
 * Endpointy związane z utrzymaniem i administracją arkusza Scrum
 */

/** Blokuje ręczne wywołania, gdy synchronizacja z arkuszem jest wygaszona. */
function blockIfScrumSyncDisabled(
    req: Request,
    res: Response,
    next: NextFunction
) {
    if (!Setup.scrumSheetSyncEnabled)
        return res
            .status(410)
            .send({ errorMessage: 'Synchronizacja z arkuszem Scrum jest wyłączona' });
    next();
}

// Odświeżenie osób w arkuszu scrum (arkusz "dane" działa zawsze; sprint/planowanie zależnie od flagi — obsłużone w personsRefresh)
app.get(
    '/maintenance/personsRefresh',
    async (req: Request, res: Response, next) => {
        try {
            await ToolsGapi.gapiReguestHandler(
                req,
                res,
                ScrumSheet.personsRefresh,
                undefined,
                ScrumSheet
            );
            res.send('scrum refreshed');
        } catch (error) {
            next(error);
        }
    }
);

// Ustawienie nagłówków w arkuszu bieżącego sprintu
app.get(
    '/maintenance/scrumSheet/setHeaders',
    blockIfScrumSyncDisabled,
    async (req: Request, res: Response, next) => {
        try {
            await ToolsGapi.gapiReguestHandler(
                req,
                res,
                CurrentSprint.setHeaders,
                undefined,
                CurrentSprint
            );
            res.send('Headers set successfully');
        } catch (error) {
            next(error);
        }
    }
);

// Sortowanie projektów w arkuszu bieżącego sprintu
app.get(
    '/maintenance/scrumSheet/sortProjects',
    blockIfScrumSyncDisabled,
    async (req: Request, res: Response, next) => {
        try {
            await ToolsGapi.gapiReguestHandler(
                req,
                res,
                CurrentSprint.sortProjects,
                undefined,
                CurrentSprint
            );
            res.send('Projects sorted successfully');
        } catch (error) {
            next(error);
        }
    }
);
