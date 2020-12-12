import express from 'express'
import ProcessesController from './ProcesesController'
var app = express();

app.get('/processes', async (req: any, res: any) => {
    try {
        var result = await ProcessesController.getProcessesList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.get('/process/:id', async (req: any, res: any) => {
    try {
        var result = await ProcessesController.getProcessesList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;