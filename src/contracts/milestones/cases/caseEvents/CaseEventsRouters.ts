import express from 'express'
import CaseEventsController from './CaseEventsController'
var app = express();

app.get('/caseEvents', async (req: any, res: any) => {
    try {
        const result = await CaseEventsController.getCaseEventsList(req.query);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }


});

app.get('/caseEvent/:id', async (req: any, res: any) => {
    try {
        const result = await CaseEventsController.getCaseEventsList(req.params);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }


});

module.exports = app;