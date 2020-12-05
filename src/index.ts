import express from 'express';
import cors from 'cors';

var app = express();
const port = process.env.PORT || 3000;

var corsOptions = {
  origin: ['http://localhost', 'https://erp-envi.herokuapp.com'],
  optionsSuccessStatus: 200 // For legacy browser support
}
app.use(cors(corsOptions));

const personsRouter = require('./persons/PersonsRouters');
app.use(personsRouter);

const entitiesRouter = require('./entities/EntitiesRouters');
app.use(entitiesRouter);

const invoicesRouter = require('./invoices/InvoicesRouters');
app.use(invoicesRouter);

const invoiceItemsRouter = require('./invoices/InvoiceItemsRouters');
app.use(invoiceItemsRouter);

const contratcsRouter = require('./contracts/ContractsRouters');
app.use(contratcsRouter);

var server = app.listen(port, () => {
  console.log(`server is listenning on port: ${port}`)
});