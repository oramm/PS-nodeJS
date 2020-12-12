import express from 'express'
import MaterialCardsController from './MaterialCardsController'
var app = express();

app.get('/materialCards', async (req: any, res: any) => {
    try {
        var result = await MaterialCardsController.getMaterialCardsList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.get('/materialCard/:id', async (req: any, res: any) => {
    try {
        var result = await MaterialCardsController.getMaterialCardsList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;