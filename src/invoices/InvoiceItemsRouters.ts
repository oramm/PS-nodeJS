import { Request, Response } from 'express';
import InvoiceItem from './InvoiceItem';
import InvoiceItemsController from './InvoiceItemsController';
import { app } from '../index';
import InvoiceItemValidator from './InvoiceItemValidator';
import ContractOur from '../contracts/ContractOur';

app.post('/invoiceItems', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await InvoiceItemsController.getInvoiceItemsList(
            orConditions
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/invoiceItem', async (req: Request, res: Response, next) => {
    try {
        let item = new InvoiceItem(req.body);
        const validator = new InvoiceItemValidator(
            new ContractOur(item._parent._contract),
            item
        );
        await validator.checkValueAgainstContract(true);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.post('/copyInvoiceItem', async (req: Request, res: Response, next) => {
    try {
        let item = new InvoiceItem(req.body);
        const validator = new InvoiceItemValidator(
            new ContractOur(item._parent._contract),
            item
        );
        await validator.checkValueAgainstContract(true);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/invoiceItem/:id', async (req: Request, res: Response, next) => {
    try {
        let item = new InvoiceItem(req.parsedBody);
        const validator = new InvoiceItemValidator(
            new ContractOur(item._parent._contract),
            item
        );
        await validator.checkValueAgainstContract(false);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/invoiceItem/:id', async (req: Request, res: Response, next) => {
    try {
        let item = new InvoiceItem(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});
