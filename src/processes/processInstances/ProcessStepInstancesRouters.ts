import express from 'express'
import ProcessStepInstancesController from './ProcessStepInstancesController'
var app = express();

app.get('/processStepInstances', async (req: any, res: any) => {
    try {
        var result = await ProcessStepInstancesController.getProcessStepInstancesList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.get('/processStepInstance/:id', async (req: any, res: any) => {
    try {
        var result = await ProcessStepInstancesController.getProcessStepInstancesList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;