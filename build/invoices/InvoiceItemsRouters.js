"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
var InvoiceItemsController_1 = __importDefault(require("./InvoiceItemsController"));
var app = express_1.default();
app.get('/invoiceItems', function (req, res) {
    InvoiceItemsController_1.default.getInvoiceItemsList(req.query, function (err, result) {
        if (err)
            res.status(500).send(err.message);
        else
            //res.send(req.query)
            res.send(InvoiceItemsController_1.default.processInvoiceItemsResult(result));
    });
});
app.get('/invoiceItem/:id', function (req, res) {
    InvoiceItemsController_1.default.getInvoiceItemsList(req.params, function (err, result) {
        if (err)
            res.status(500).send(err.message);
        else
            res.send(InvoiceItemsController_1.default.processInvoiceItemsResult(result));
    });
});
module.exports = app;
