import express from 'express'
import EntitiesController from './EntitiesController'
var app = express();

app.get('/entities', (req: any, res: any) => {
    EntitiesController.getEntitiesList({}, (err: any, result: any) => {
        if (err)
            res.status(500).send(err.message);
        else
            res.send(EntitiesController.processEntitiesResult(result));
    });
});

app.get('/entity/:id', (req: any, res: any) => {
    EntitiesController.getEntitiesList(req.params, (err: any, result: any) => {
        if (err)
            res.status(500).send(err.message);
        else
            res.send(EntitiesController.processEntitiesResult(result));
    });
});

module.exports = app;