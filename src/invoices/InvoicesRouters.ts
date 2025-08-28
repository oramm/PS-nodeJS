import ToolsGapi from '../setup/Sessions/ToolsGapi';
import InvoicesController from './InvoicesController';
import { app } from '../index';
import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';

app.post('/invoices', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await InvoicesController.find(orConditions);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/invoice', async (req: Request, res: Response, next) => {
    try {
        const item = await InvoicesController.addNewInvoice(req.body);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.post('/copyInvoice', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) throw new Error('Użytkownik niezalogowany');

        const copy = await InvoicesController.copyInvoice(req.body, req.session.userData);
        res.send(copy);
    } catch (error) {
        next(error);
    }
});

app.put('/invoice/:id', async (req: Request, res: Response, next) => {
    try {
        //nie ma validacji przy edycji bo jest zbędna - jest w edycji pozycji
        const fieldsToUpdate = req.parsedBody._fieldsToUpdate;
        if (req.body.gdId && req.body.status?.match(/Na później|Do zrobienia/i)) {
            await ToolsGapi.gapiReguestHandler(
                req,
                res,
                async (auth: OAuth2Client) => {
                    const item = await InvoicesController.updateInvoice(req.parsedBody, fieldsToUpdate, auth);
                    res.send(item);
                }
            );
        } else {
            const item = await InvoicesController.updateInvoice(req.parsedBody, fieldsToUpdate);
            res.send(item);
        }
    } catch (error) {
        next(error);
    }
});

app.put(
    '/setAsToMakeInvoice/:id',
    async (req: Request, res: Response, next) => {
        try {
            const item = await InvoicesController.updateInvoiceStatus(req.parsedBody, 'Do zrobienia');
            res.send(item);
        } catch (error) {
            next(error);
        }
    }
);

app.put('/issueInvoice/:id', async (req: Request, res: Response, next) => {
    try {
        if (!req.files) req.files = [];
        console.log(req.files);
        if (!Array.isArray(req.files)) throw new Error('Nie załączono pliku');
        let invoiceFile: Express.Multer.File;
        invoiceFile = req.files[0];

        const itemFromClient = req.parsedBody;
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            async (auth: OAuth2Client) => {
                const item = await InvoicesController.issueInvoice(itemFromClient, invoiceFile, auth);
                res.send(item);
            }
        );
    } catch (error) {
        next(error);
    }
});

app.put('/setAsSentInvoice/:id', async (req: Request, res: Response, next) => {
    try {
        const item = await InvoicesController.updateInvoiceStatus(req.parsedBody, 'Wysłana');
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/setAsPaidInvoice/:id', async (req: Request, res: Response, next) => {
    try {
        const item = await InvoicesController.updateInvoiceStatus(req.parsedBody, 'Zapłacona');
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/invoice/:id', async (req: Request, res: Response, next) => {
    try {
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            async (auth: OAuth2Client) => {
                const result = await InvoicesController.deleteInvoice(req.body, auth);
                res.send(result);
            });
    } catch (error) {
        next(error);
    }
});
