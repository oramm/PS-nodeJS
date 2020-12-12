import express from 'express'
import EntitiesController from './EntitiesController'
var app = express();

app.get('/entities', async (req: any, res: any) => {
    try {
        var result = await EntitiesController.getEntitiesList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.get('/entity/:id', async (req: any, res: any) => {
    try {
        var result = await EntitiesController.getEntitiesList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;