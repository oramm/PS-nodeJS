"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
var InvoicesController_1 = __importDefault(require("./InvoicesController"));
var app = express_1.default();
app.get('/invoices', function (req, res) {
    InvoicesController_1.default.getInvoicesList(req.query, function (err, result) {
        if (err)
            res.status(500).send(err.message);
        else
            res.send(InvoicesController_1.default.processInvoicesResult(result));
    });
});
app.get('/invoice/:id', function (req, res) {
    InvoicesController_1.default.getInvoicesList(req.params, function (err, result) {
        if (err)
            res.status(500).send(err.message);
        else
            res.send(InvoicesController_1.default.processInvoicesResult(result));
    });
});
module.exports = app;
