import express from 'express';
import MaterialCardsController from './MaterialCardsController';
var app = express();

app.get('/materialCards', async (req: any, res: any, next) => {
    try {
        const result = await MaterialCardsController.getMaterialCardsList(
            req.query
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.get('/materialCard/:id', async (req: any, res: any, next) => {
    try {
        const result = await MaterialCardsController.getMaterialCardsList(
            req.params
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

module.exports = app;
