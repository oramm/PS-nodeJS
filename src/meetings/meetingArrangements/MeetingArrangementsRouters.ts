import express from 'express';
import MeetingArrangementsController from './MeetingArrangementsController';
var app = express();

app.get('/meetingArrangements', async (req: any, res: any, next) => {
    try {
        const result =
            await MeetingArrangementsController.getMeetingArrangementsList(
                req.query
            );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.get('/meetingArrangement/:id', async (req: any, res: any, next) => {
    try {
        const result =
            await MeetingArrangementsController.getMeetingArrangementsList(
                req.params
            );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

module.exports = app;
