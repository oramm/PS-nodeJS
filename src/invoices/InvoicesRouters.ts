import express from 'express'
import { drive_v3 } from 'googleapis';
import ToolsGapi from '../setup/GAuth2/ToolsGapi';
import ToolsGd from '../tools/ToolsGd';
import Invoice from './Invoice';
import InvoicesController from './InvoicesController'
import { app } from '../index'

app.get('/invoices', async (req: any, res: any) => {
    try {
        var result = await InvoicesController.getInvoicesList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.get('/invoice/:id', async (req: any, res: any) => {
    try {
        var result = await InvoicesController.getInvoicesList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post('/invoice', async (req: any, res: any) => {
    try {
        let item = new Invoice(req.body);
        await item.addInDb();
        res.send(item);
    } catch (error) {
        res.status(500).send(error.message);
        console.log(error);
    };
});

app.post('/copyInvoice', async (req: any, res: any) => {
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
        res.status(500).send(error.message);
        console.log(error);
    };
});

app.put('/invoice/:id', async (req: any, res: any) => {
    try {
        let item = new Invoice(req.body);
        await item.editInDb();
        if (item.gdId && item.status?.match(/Na później|Do zrobienia|/i)) {
            await ToolsGapi.gapiReguestHandler(req, res, ToolsGd.trashFile, req.body.gdId);
            item.gdId = undefined;
        }
        res.send(item);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.put('/issueInvoice/:id', async (req: any, res: any) => {
    try {
        let promises: any[] = await Promise.all(
            [
                ToolsGapi.gapiReguestHandler(req, res, ToolsGd.uploadFile, req.body._blobEnviObjects),
                (!req.body.gdId) ? null : ToolsGapi.gapiReguestHandler(req, res, ToolsGd.trashFile, req.body.gdId),
            ]
        )
        let item = new Invoice(req.body);
        let fileData: drive_v3.Schema$File = promises[0];
        item.gdId = fileData.id;
        item.status = 'Zrobiona';
        await item.editInDb();
        res.send(item);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.put('/setAsToMakeInvoice/:id', async (req: any, res: any) => {
    try {
        let item = new Invoice(req.body);
        item.status = 'Do zrobienia';
        await item.editInDb();
        res.send(item);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.put('/setAsSentInvoice/:id', async (req: any, res: any) => {
    try {
        let item = new Invoice(req.body);
        item.status = 'Wysłana';
        await item.editInDb();
        res.send(item);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.put('/setAsPaidInvoice/:id', async (req: any, res: any) => {
    try {
        let item = new Invoice(req.body);
        item.status = 'Zapłacona';
        await item.editInDb();
        res.send(item);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.delete('/invoice/:id', async (req: any, res: any) => {
    try {
        let item = new Invoice(req.body);
        await item.deleteFromDb();
        if (req.body.gdId)
            await ToolsGapi.gapiReguestHandler(req, res, ToolsGd.trashFile, req.body.gdId);
        res.send(item);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

module.exports = app;