import express from 'express';

var app = express();
const port = process.env.PORT || 3000;

//app.use(express.json);
app.use((req: any, res: any, next: any) => {
  //res.header("Access-Control-Allow-Origin", "http://localhost", "http://ps.envi.com.pl", "http://erp.envi.com.pl"); // update to match the domain you will make the request from
  res.header("Access-Control-Allow-Origin", "http://localhost")
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

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

var server = app.listen(3000, () => {
  console.log(`server is listenning on port: ${port}`)
});