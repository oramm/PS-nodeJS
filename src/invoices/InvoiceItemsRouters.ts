import { salesInvoiceAccess } from './salesInvoiceScope';
import { Request, Response } from 'express';
import InvoiceItemsController from './InvoiceItemsController';
import { app } from '../index';

app.post('/invoiceItems', salesInvoiceAccess('itemsList'), async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await InvoiceItemsController.find(
            orConditions, req.salesInvoiceScope
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/invoiceItem', salesInvoiceAccess('newItem'), async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) throw new Error('Użytkownik niezalogowany');
        const item = await InvoiceItemsController.addNewInvoiceItem(req.body, req.session.userData);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.post('/copyInvoiceItem', salesInvoiceAccess('newItem'), async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) throw new Error('Użytkownik niezalogowany');
        const item = await InvoiceItemsController.addNewInvoiceItem(req.body, req.session.userData);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/invoiceItem/:id', salesInvoiceAccess('item'), async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) throw new Error('Użytkownik niezalogowany');
        const fieldsToUpdate = req.parsedBody._fieldsToUpdate;
        const item = await InvoiceItemsController.updateInvoiceItem(req.parsedBody, fieldsToUpdate, req.session.userData);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/invoiceItem/:id', salesInvoiceAccess('item'), async (req: Request, res: Response, next) => {
    try {
        const result = await InvoiceItemsController.deleteInvoiceItem(req.body);
        res.send(result);
    } catch (error) {
        next(error);
    }
});
