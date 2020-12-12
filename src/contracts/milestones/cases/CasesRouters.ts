import express from 'express'
import CasesController from './CasesController'
var app = express();

app.get('/cases', async (req: any, res: any) => {
    try {
        var result = await CasesController.getCasesList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
        console.error(err);
    }


});

app.get('/case/:id', async (req: any, res: any) => {
    try {
        var result = await CasesController.getCasesList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;