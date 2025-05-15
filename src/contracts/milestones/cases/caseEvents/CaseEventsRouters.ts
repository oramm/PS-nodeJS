import express from 'express';
import CaseEventsController from './CaseEventsController';
var app = express();

app.get('/caseEvents', async (req: any, res: any, next) => {
    try {
        const result = await CaseEventsController.getCaseEventsList(req.query);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.get('/caseEvent/:id', async (req: any, res: any, next) => {
    try {
        const result = await CaseEventsController.getCaseEventsList(req.params);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

module.exports = app;
