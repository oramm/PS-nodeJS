import express from 'express'
import PersonsController from './PersonsController'
var app = express();

app.get('/persons', (req: any, res: any) => {
    PersonsController.getPersonsList(req.query, (err: any, result: any) => {
        if (err)
            res.status(500).send(err.message);
        else
            res.send(PersonsController.processPersonsResult(result));
    });
});

app.get('/person/:id', (req: any, res: any) => {
    PersonsController.getPersonsList(req.params, (err: any, result: any) => {
        if (err)
            res.status(500).send(err.message);
        else
            res.send(PersonsController.processPersonsResult(result));
    });
});

module.exports = app;