import express from 'express'
import ContractTypesController from './ContractTypesController'
var app = express();

app.get('/contractTypes', async (req: any, res: any) => {
    try {
        var result = await ContractTypesController.getContractTypesList(req.query);
        res.send(result);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }


});

app.get('/contractType/:id', async (req: any, res: any) => {
    try {
        var result = await ContractTypesController.getContractTypesList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;