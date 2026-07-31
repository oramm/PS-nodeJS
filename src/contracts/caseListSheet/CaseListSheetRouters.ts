import { Request, Response } from 'express';
import { app } from '../../index';
import CaseListSheetController from './CaseListSheetController';

/** Generowanie „Spisu spraw" kontraktu jako arkusza Google. */
app.post('/contractCaseListSheet', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) throw new Error('Użytkownik niezalogowany');

        const result = await CaseListSheetController.generate(req.parsedBody);
        res.send(result);
    } catch (error) {
        next(error);
    }
});
