import { Request, Response } from 'express'
import InvoiceItem from './InvoiceItem';
import InvoiceItemsController from './InvoiceItemsController'
import { app } from '../index'
import InvoiceItemValidator from './InvoiceItemValidator';
import ContractOur from '../contracts/ContractOur';

app.post('/invoiceItems', async (req: Request, res: Response) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await InvoiceItemsController.getInvoiceItemsList(orConditions);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/invoiceItem', async (req: Request, res: Response) => {
    try {
        let item = new InvoiceItem(req.body);
        const validator = new InvoiceItemValidator(new ContractOur(item._parent._contract), item);
        await validator.checkValueAgainstContract(true);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    };
});

app.post('/copyInvoiceItem', async (req: Request, res: Response) => {
    try {
        let item = new InvoiceItem(req.body);
        const validator = new InvoiceItemValidator(new ContractOur(item._parent._contract), item);
        await validator.checkValueAgainstContract(true);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    };
});

app.put('/invoiceItem/:id', async (req: Request, res: Response) => {
    try {
        let item = new InvoiceItem(req.body);
        const validator = new InvoiceItemValidator(new ContractOur(item._parent._contract), item);
        await validator.checkValueAgainstContract(false);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.delete('/invoiceItem/:id', async (req: Request, res: Response) => {
    try {
        let item = new InvoiceItem(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});