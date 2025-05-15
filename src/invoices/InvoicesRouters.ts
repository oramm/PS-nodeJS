import { drive_v3 } from 'googleapis';
import ToolsGapi from '../setup/Sessions/ToolsGapi';
import ToolsGd from '../tools/ToolsGd';
import Invoice from './Invoice';
import InvoicesController from './InvoicesController';
import { app } from '../index';
import { Request, Response } from 'express';
import InvoiceValidator from './InvoiceValidator';
import ContractOur from '../contracts/ContractOur';

app.post('/invoices', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await InvoicesController.getInvoicesList(orConditions);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/invoice', async (req: Request, res: Response, next) => {
    try {
        const invoice = new Invoice(req.body);
        const validator = new InvoiceValidator(
            new ContractOur(invoice._contract),
            invoice
        );
        await validator.checkValueWithContract(true);
        await invoice.addInDb();
        res.send(invoice);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.post('/copyInvoice', async (req: Request, res: Response, next) => {
    try {
        let item = new Invoice(req.body);
        const validator = new InvoiceValidator(
            new ContractOur(item._contract),
            item
        );
        await validator.checkValueWithContract(true);
        await item.copyController();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.put('/invoice/:id', async (req: Request, res: Response, next) => {
    try {
        //nie ma validacji przy edycji bo jest zbędna - jest w edycji pozycji
        const _fieldsToUpdate = req.parsedBody._fieldsToUpdate;
        const itemFromClient = req.parsedBody;
        let item = new Invoice(itemFromClient);
        if (item.gdId && item.status?.match(/Na później|Do zrobienia/i)) {
            await ToolsGapi.gapiReguestHandler(
                req,
                res,
                ToolsGd.trashFile,
                item.gdId,
                ToolsGd
            );
            item.setGdIdAndUrl(null);
        }

        await item.editInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.put(
    '/setAsToMakeInvoice/:id',
    async (req: Request, res: Response, next) => {
        try {
            const _fieldsToUpdate = req.parsedBody._fieldsToUpdate;
            const itemFromClient = req.parsedBody;
            let item = new Invoice({
                ...itemFromClient,
                status: 'Do zrobienia',
            });
            await item.editInDb();
            res.send(item);
        } catch (error) {
            next(error);
        }
    }
);

app.put('/issueInvoice/:id', async (req: Request, res: Response, next) => {
    try {
        const _fieldsToUpdate = req.parsedBody._fieldsToUpdate;
        const itemFromClient = req.parsedBody;
        const parentGdFolderId = '1WsNoU0m9BoeVHeb_leAFwtRa94k0CD71';
        if (!req.files) req.files = [];
        console.log(req.files);
        if (!Array.isArray(req.files)) throw new Error('Nie załączono pliku');
        let invoceFile: Express.Multer.File;
        invoceFile = req.files[0];
        let item = new Invoice({ ...itemFromClient, status: 'Zrobiona' });

        let promises: any[] = await Promise.all([
            ToolsGapi.gapiReguestHandler(req, res, ToolsGd.uploadFileMulter, [
                invoceFile,
                undefined,
                parentGdFolderId,
            ]),
            !item.gdId
                ? null
                : ToolsGapi.gapiReguestHandler(
                      req,
                      res,
                      ToolsGd.trashFile,
                      item.gdId
                  ),
        ]);
        let fileData: drive_v3.Schema$File = promises[0];
        item.setGdIdAndUrl(fileData.id);
        await item.editInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/setAsSentInvoice/:id', async (req: Request, res: Response, next) => {
    try {
        const _fieldsToUpdate = req.parsedBody._fieldsToUpdate;
        const itemFromClient = req.parsedBody;
        const item = new Invoice({ ...itemFromClient, status: 'Wysłana' });

        await item.editInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/setAsPaidInvoice/:id', async (req: Request, res: Response, next) => {
    try {
        const _fieldsToUpdate = req.parsedBody._fieldsToUpdate;
        const itemFromClient = req.parsedBody;
        const item = new Invoice({ ...itemFromClient, status: 'Zapłacona' });
        await item.editInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/invoice/:id', async (req: Request, res: Response, next) => {
    try {
        let item = new Invoice(req.body);
        await item.deleteFromDb();
        if (req.body.gdId)
            await ToolsGapi.gapiReguestHandler(
                req,
                res,
                ToolsGd.trashFile,
                req.body.gdId
            );
        res.send(item);
    } catch (error) {
        next(error);
    }
});
