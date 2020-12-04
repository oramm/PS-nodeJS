import express from 'express'
import InvoicesController from './InvoicesController'
var app = express();

app.get('/invoices', (req: any, res: any) => {
    InvoicesController.getInvoicesList(req.query, (err: any, result: any) => {
        if (err)
            res.status(500).send(err.message);
        else
            res.send(InvoicesController.processInvoicesResult(result));
    });
});

app.get('/invoice/:id', (req: any, res: any) => {
    InvoicesController.getInvoicesList(req.params, (err: any, result: any) => {
        if (err)
            res.status(500).send(err.message);
        else
            res.send(InvoicesController.processInvoicesResult(result));
    });
});

module.exports = app;