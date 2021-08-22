import express from 'express'
import RisksReactionsController from './RisksReactionsController'
var app = express();

app.get('/risksReactions', async (req: any, res: any) => {
    try {
        var result = await RisksReactionsController.getRisksReactionsList(req.query);
        res.send(result);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }


});

app.get('/risksReaction/:id', async (req: any, res: any) => {
    try {
        var result = await RisksReactionsController.getRisksReactionsList(req.params);
        res.send(result);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }


});

module.exports = app;