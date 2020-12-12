import express from 'express'
import MeetingArrangementsController from './MeetingArrangementsController'
var app = express();

app.get('/meetingArrangements', async (req: any, res: any) => {
    try {
        var result = await MeetingArrangementsController.getMeetingArrangementsList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.get('/meetingArrangement/:id', async (req: any, res: any) => {
    try {
        var result = await MeetingArrangementsController.getMeetingArrangementsList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;