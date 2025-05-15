import express from 'express';
import RisksController from './RisksController';
var app = express();

app.get('/risks', async (req: any, res: any, next) => {
    try {
        const result = await RisksController.getRisksList(req.query);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.get('/risk/:id', async (req: any, res: any, next) => {
    try {
        const result = await RisksController.getRisksList(req.params);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

module.exports = app;
