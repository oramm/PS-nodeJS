import { app } from '../index';
import { Request, Response } from 'express';
import ToolsGapi from '../setup/Sessions/ToolsGapi';
import ScrumSheet from './ScrumSheet';
import CurrentSprint from './CurrentSprint';

/**
 * Endpointy związane z utrzymaniem i administracją arkusza Scrum
 */

// Odświeżenie osób w arkuszu scrum
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
