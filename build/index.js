"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
var app = express_1.default();
var port = process.env.PORT || 3000;
//app.use(express.json);
app.use(function (req, res, next) {
    //res.header("Access-Control-Allow-Origin", "http://localhost", "http://ps.envi.com.pl", "http://erp.envi.com.pl"); // update to match the domain you will make the request from
    res.header("Access-Control-Allow-Origin", "http://localhost");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
var personsRouter = require('./persons/PersonsRouters');
app.use(personsRouter);
var entitiesRouter = require('./entities/EntitiesRouters');
app.use(entitiesRouter);
var invoicesRouter = require('./invoices/InvoicesRouters');
app.use(invoicesRouter);
var invoiceItemsRouter = require('./invoices/InvoiceItemsRouters');
app.use(invoiceItemsRouter);
var contratcsRouter = require('./contracts/ContractsRouters');
app.use(contratcsRouter);
var server = app.listen(3000, function () {
    console.log("server is listenning on port: " + port);
});
