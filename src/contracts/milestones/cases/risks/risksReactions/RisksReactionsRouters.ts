import express from 'express'
import RisksReactionsController from './RisksReactionsController'
var app = express();

app.get('/risksReactions', async (req: any, res: any) => {
    try {
        var result = await RisksReactionsController.getRisksReactionsList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.get('/risksReaction/:id', async (req: any, res: any) => {
    try {
        var result = await RisksReactionsController.getRisksReactionsList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;