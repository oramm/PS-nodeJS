import express from 'express'
import CaseEventsController from './CaseEventsController'
var app = express();

app.get('/caseEvents', async (req: any, res: any) => {
    try {
        var result = await CaseEventsController.getCaseEventsList(req.query);
        res.send(result);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }


});

app.get('/caseEvent/:id', async (req: any, res: any) => {
    try {
        var result = await CaseEventsController.getCaseEventsList(req.params);
        res.send(result);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }


});

module.exports = app;