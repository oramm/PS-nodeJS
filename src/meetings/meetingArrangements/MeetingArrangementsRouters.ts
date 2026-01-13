import express from 'express';
import MeetingArrangementsController from './MeetingArrangementsController';
var app = express();

app.get('/meetingArrangements', async (req: any, res: any, next) => {
    try {
        const result = await MeetingArrangementsController.find(req.query);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.get('/meetingArrangement/:id', async (req: any, res: any, next) => {
    try {
        const result = await MeetingArrangementsController.find({
            id: parseInt(req.params.id, 10),
        });
        res.send(result);
    } catch (error) {
        next(error);
    }
});

module.exports = app;
