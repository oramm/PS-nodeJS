import { Request, Response } from 'express';
import { app } from '../../index';
import CaseListSheetController from './CaseListSheetController';

/** Generowanie „Spisu spraw" kontraktu jako arkusza Google. */
app.post('/contractCaseListSheet', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) throw new Error('Użytkownik niezalogowany');

        const result = await CaseListSheetController.generate(
            req.parsedBody,
            req.projectScope
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

/** Adres podfolderu „Spisy spraw" — link w nagłówku okna generowania. */
app.post('/caseListSheetFolder', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) throw new Error('Użytkownik niezalogowany');

        const result = await CaseListSheetController.findFolder(
            req.parsedBody,
            req.projectScope
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

/** To samo dla całego projektu — jeden arkusz ze wszystkimi jego kontraktami. */
app.post('/projectCaseListSheet', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) throw new Error('Użytkownik niezalogowany');

        const result = await CaseListSheetController.generateForProject(
            req.parsedBody,
            req.projectScope
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});
