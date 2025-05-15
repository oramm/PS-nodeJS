import express from 'express';
import RisksReactionsController from './RisksReactionsController';
var app = express();

app.get('/risksReactions', async (req: any, res: any, next) => {
    try {
        const result = await RisksReactionsController.getRisksReactionsList(
            req.query
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.get('/risksReaction/:id', async (req: any, res: any, next) => {
    try {
        const result = await RisksReactionsController.getRisksReactionsList(
            req.params
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

module.exports = app;
