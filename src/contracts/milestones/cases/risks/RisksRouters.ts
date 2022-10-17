import express from 'express'
import RisksController from './RisksController'
var app = express();

app.get('/risks', async (req: any, res: any) => {
    try {
        const result = await RisksController.getRisksList(req.query);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    }


});

app.get('/risk/:id', async (req: any, res: any) => {
    try {
        const result = await RisksController.getRisksList(req.params);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    }


});

module.exports = app;