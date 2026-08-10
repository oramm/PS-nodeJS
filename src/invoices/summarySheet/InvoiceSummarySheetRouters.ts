import { Request, Response } from 'express';
import { app } from '../../index';
import InvoiceSummarySheetController from './InvoiceSummarySheetController';

/** Generowanie „Podsumowania faktur" kontraktu jako arkusza Google. */
app.post(
    '/contractInvoiceSummarySheet',
    async (req: Request, res: Response, next) => {
        try {
            if (!req.session.userData)
                throw new Error('Użytkownik niezalogowany');

            const result = await InvoiceSummarySheetController.generate(
                req.parsedBody,
                req.projectScope
            );
            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);
