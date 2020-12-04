import express from 'express'
import ContractsController from './ContractsController'
var app = express();

app.get('/contracts', (req: any, res: any) => {
    ContractsController.getContractsList(req.query, (err: any, result: any) => {
        if (err)
            res.status(500).send(err.message);
        else
            res.send(ContractsController.processContractsResult(result));
    });
});

app.get('/contract/:id', (req: any, res: any) => {
    ContractsController.getContractsList(req.params, (err: any, result: any) => {
        if (err)
            res.status(500).send(err.message);
        else
            res.send(ContractsController.processContractsResult(result));
    });
});

module.exports = app;