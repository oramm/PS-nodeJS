import express from 'express'
import RisksController from './RisksController'
var app = express();

app.get('/risks', async (req: any, res: any) => {
    try {
        var result = await RisksController.getRisksList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.get('/risk/:id', async (req: any, res: any) => {
    try {
        var result = await RisksController.getRisksList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;