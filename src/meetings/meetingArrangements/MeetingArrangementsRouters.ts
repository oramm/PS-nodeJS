import express from 'express'
import MeetingArrangementsController from './MeetingArrangementsController'
var app = express();

app.get('/meetingArrangements', async (req: any, res: any) => {
    try {
        const result = await MeetingArrangementsController.getMeetingArrangementsList(req.query);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }


});

app.get('/meetingArrangement/:id', async (req: any, res: any) => {
    try {
        const result = await MeetingArrangementsController.getMeetingArrangementsList(req.params);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }


});

module.exports = app;