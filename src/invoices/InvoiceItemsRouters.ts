import express from 'express'
import InvoiceItemsController from './InvoiceItemsController'
var app = express();

app.get('/invoiceItems', (req: any, res: any) => {
    InvoiceItemsController.getInvoiceItemsList(req.query, (err: any, result: any) => {
        if (err)
            res.status(500).send(err.message);
        else
            //res.send(req.query)
            res.send(InvoiceItemsController.processInvoiceItemsResult(result));
    });
});

app.get('/invoiceItem/:id', (req: any, res: any) => {
    InvoiceItemsController.getInvoiceItemsList(req.params, (err: any, result: any) => {
        if (err)
            res.status(500).send(err.message);
        else
            res.send(InvoiceItemsController.processInvoiceItemsResult(result));
    });
});

module.exports = app;