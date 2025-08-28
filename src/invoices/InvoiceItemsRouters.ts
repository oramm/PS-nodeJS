import { Request, Response } from 'express';
import InvoiceItemsController from './InvoiceItemsController';
import { app } from '../index';

app.post('/invoiceItems', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await InvoiceItemsController.find(
            orConditions
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/invoiceItem', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) throw new Error('Użytkownik niezalogowany');
        const item = await InvoiceItemsController.addNewInvoiceItem(req.body, req.session.userData);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.post('/copyInvoiceItem', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) throw new Error('Użytkownik niezalogowany');
        const item = await InvoiceItemsController.addNewInvoiceItem(req.body, req.session.userData);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/invoiceItem/:id', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) throw new Error('Użytkownik niezalogowany');
        const fieldsToUpdate = req.parsedBody._fieldsToUpdate;
        const item = await InvoiceItemsController.updateInvoiceItem(req.parsedBody, fieldsToUpdate, req.session.userData);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/invoiceItem/:id', async (req: Request, res: Response, next) => {
    try {
        const result = await InvoiceItemsController.deleteInvoiceItem(req.body);
        res.send(result);
    } catch (error) {
        next(error);
    }
});
