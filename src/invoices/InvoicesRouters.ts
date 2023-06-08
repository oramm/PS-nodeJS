import { drive_v3 } from 'googleapis';
import ToolsGapi from '../setup/GAuth2/ToolsGapi';
import ToolsGd from '../tools/ToolsGd';
import Invoice from './Invoice';
import InvoicesController from './InvoicesController'
import { app } from '../index'
import { Request, Response } from 'express';

app.get('/invoices', async (req: Request, res: Response) => {
    try {
        const result = await InvoicesController.getInvoicesList(req.parsedQuery);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.get('/invoice/:id', async (req: Request, res: Response) => {
    try {
        const result = await InvoicesController.getInvoicesList(req.params);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/invoice', async (req: Request, res: Response) => {
    try {
        let item = new Invoice(req.body);
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    };
});

app.post('/copyInvoice', async (req: Request, res: Response) => {
    try {
        delete req.body.gdId;
        delete req.body.number;
        delete req.body.sentDate;
        delete req.body.paymentDeadline;
        req.body.description += ' - kopia';
        req.body.status = 'Na później'
        let item = new Invoice(req.body);
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    };
});

app.put('/invoice/:id', async (req: Request, res: Response) => {
    try {
        let item = new Invoice(req.body);
        if (item.gdId && item.status?.match(/Na później|Do zrobienia|/i)) {
            await ToolsGapi.gapiReguestHandler(req, res, ToolsGd.trashFile, req.body.gdId, ToolsGd);
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

app.put('/setAsToMakeInvoice/:id', async (req: Request, res: Response) => {
    try {
        let item = new Invoice(req.body);
        item.status = 'Do zrobienia';
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.put('/issueInvoice/:id', async (req: Request, res: Response) => {
    try {
        const parentFolderGdId = '1WsNoU0m9BoeVHeb_leAFwtRa94k0CD71'
        if (!req.files) req.files = [];
        console.log(req.files);
        if (!Array.isArray(req.files)) throw new Error('Nie załączono pliku');
        let invoceFile: Express.Multer.File;
        invoceFile = req.files[0];

        let promises: any[] = await Promise.all(
            [
                ToolsGapi.gapiReguestHandler(req, res, ToolsGd.uploadFileMulter, [invoceFile, undefined, parentFolderGdId]),
                (!req.parsedBody.gdId) ? null : ToolsGapi.gapiReguestHandler(req, res, ToolsGd.trashFile, req.parsedBody.gdId),
            ]
        )
        let item = new Invoice(req.parsedBody);
        let fileData: drive_v3.Schema$File = promises[0];
        item.setGdIdAndUrl(fileData.id);
        item.status = 'Zrobiona';
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.put('/setAsSentInvoice/:id', async (req: Request, res: Response) => {
    try {
        let item = new Invoice(req.body);
        item.status = 'Wysłana';
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.put('/setAsPaidInvoice/:id', async (req: Request, res: Response) => {
    try {
        let item = new Invoice(req.body);
        item.status = 'Zapłacona';
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.delete('/invoice/:id', async (req: Request, res: Response) => {
    try {
        let item = new Invoice(req.body);
        await item.deleteFromDb();
        if (req.body.gdId)
            await ToolsGapi.gapiReguestHandler(req, res, ToolsGd.trashFile, req.body.gdId);
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});