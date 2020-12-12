import express from 'express'
import CaseEventsController from './CaseEventsController'
var app = express();

app.get('/caseEvents', async (req: any, res: any) => {
    try {
        var result = await CaseEventsController.getCaseEventsList(req.query);
        res.send(result);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }


});

app.get('/caseEvent/:id', async (req: any, res: any) => {
    try {
        var result = await CaseEventsController.getCaseEventsList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;