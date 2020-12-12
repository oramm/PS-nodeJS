import express from 'express'
import CaseTypesController from './CaseTypesController'
var app = express();

app.get('/caseTypes', async (req: any, res: any) => {
    try {
        var result = await CaseTypesController.getCaseTypesList(req.query);
        res.send(result);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }


});

app.get('/caseType/:id', async (req: any, res: any) => {
    try {
        var result = await CaseTypesController.getCaseTypesList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;