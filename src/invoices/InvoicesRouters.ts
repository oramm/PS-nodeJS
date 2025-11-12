import InvoicesController from './InvoicesController';
import { app } from '../index';
import { Request, Response } from 'express';

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
        const item = await InvoicesController.add(req.body);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.post('/copyInvoice', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) throw new Error('Użytkownik niezalogowany');

        const copy = await InvoicesController.copy(
            req.body,
            req.session.userData
        );
        res.send(copy);
    } catch (error) {
        next(error);
    }
});

app.put('/invoice/:id', async (req: Request, res: Response, next) => {
    try {
        //nie ma validacji przy edycji bo jest zbędna - jest w edycji pozycji
        const fieldsToUpdate = req.parsedBody._fieldsToUpdate;

        // ✅ PRZYWRÓCONA logika warunkowa - auth tylko gdy trzeba usunąć plik GD
        if (
            req.body.gdId &&
            req.body.status?.match(/Na później|Do zrobienia/i)
        ) {
            const item = await InvoicesController.edit(
                req.parsedBody,
                fieldsToUpdate,
                'FETCH_TOKEN'
            );
            res.send(item);
        } else {
            const item = await InvoicesController.edit(
                req.parsedBody,
                fieldsToUpdate
            );
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
            const item = await InvoicesController.updateStatus(
                req.parsedBody,
                'Do zrobienia'
            );
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

        const item = await InvoicesController.issue(
            itemFromClient,
            invoiceFile,
            'FETCH_TOKEN'
        );
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/setAsSentInvoice/:id', async (req: Request, res: Response, next) => {
    try {
        const item = await InvoicesController.updateStatus(
            req.parsedBody,
            'Wysłana'
        );
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/setAsPaidInvoice/:id', async (req: Request, res: Response, next) => {
    try {
        const item = await InvoicesController.updateStatus(
            req.parsedBody,
            'Zapłacona'
        );
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/invoice/:id', async (req: Request, res: Response, next) => {
    try {
        const result = await InvoicesController.delete(req.body, 'FETCH_TOKEN');
        res.send(result);
    } catch (error) {
        next(error);
    }
});
