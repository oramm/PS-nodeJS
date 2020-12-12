import express from 'express'
import ContractsController from './ContractsController'
var app = express();

app.get('/contracts', async (req: any, res: any) => {
    try {
        var result = await ContractsController.getContractsList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.get('/contract/:id', async (req: any, res: any) => {
    try {
        var result = await ContractsController.getContractsList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

module.exports = app;