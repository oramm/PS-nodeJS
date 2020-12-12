import express from 'express'
import ProcessStepsController from './ProcessStepsController'
var app = express();

app.get('/processSteps', async (req: any, res: any) => {
    try {
        var result = await ProcessStepsController.getProcessStepsList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.get('/processStep/:id', async (req: any, res: any) => {
    try {
        var result = await ProcessStepsController.getProcessStepsList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;