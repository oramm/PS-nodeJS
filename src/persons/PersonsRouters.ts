import express from 'express'
import PersonsController from './PersonsController'
var app = express();

app.get('/persons', async (req: any, res: any) => {
    try {
        var result = await PersonsController.getPersonsList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.get('/person/:id', async (req: any, res: any) => {
    try {
        var result = await PersonsController.getPersonsList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;