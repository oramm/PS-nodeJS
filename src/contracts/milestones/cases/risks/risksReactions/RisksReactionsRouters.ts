import express from 'express'
import RisksReactionsController from './RisksReactionsController'
var app = express();

app.get('/risksReactions', async (req: any, res: any) => {
    try {
        const result = await RisksReactionsController.getRisksReactionsList(req.query);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }


});

app.get('/risksReaction/:id', async (req: any, res: any) => {
    try {
        const result = await RisksReactionsController.getRisksReactionsList(req.params);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }


});

module.exports = app;