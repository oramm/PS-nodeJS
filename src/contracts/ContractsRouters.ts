import express from 'express'
import ContractsController from './ContractsController'
var app = express();

app.get('/contracts', async (req: any, res: any) => {
    try {
        //odwróć zmienną bo nazwa isArchived czytelniejsza niż isActive
        if (typeof req.query.isArchived === 'string')
            req.query.isArchived = req.query.isArchived !== 'true';
        var result = await ContractsController.getContractsList(req.query);
        res.send(result);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }


});

app.get('/contract/:id', async (req: any, res: any) => {
    try {
        var result = await ContractsController.getContractsList(req.params);
        res.send(result);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }
});

module.exports = app;