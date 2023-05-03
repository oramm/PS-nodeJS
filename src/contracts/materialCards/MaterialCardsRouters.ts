import express from 'express'
import MaterialCardsController from './MaterialCardsController'
var app = express();

app.get('/materialCards', async (req: any, res: any) => {
    try {
        const result = await MaterialCardsController.getMaterialCardsList(req.query);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }


});

app.get('/materialCard/:id', async (req: any, res: any) => {
    try {
        const result = await MaterialCardsController.getMaterialCardsList(req.params);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }


});

module.exports = app;