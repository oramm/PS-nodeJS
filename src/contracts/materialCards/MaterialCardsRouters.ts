import express from 'express'
import MaterialCardsController from './MaterialCardsController'
var app = express();

app.get('/materialCards', async (req: any, res: any) => {
    try {
        var result = await MaterialCardsController.getMaterialCardsList(req.query);
        res.send(result);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }


});

app.get('/materialCard/:id', async (req: any, res: any) => {
    try {
        var result = await MaterialCardsController.getMaterialCardsList(req.params);
        res.send(result);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }


});

module.exports = app;