import express from 'express';
import MeetingsController from './MeetingsController';
var app = express();

app.get('/meetings', async (req: any, res: any, next) => {
    try {
        const result = await MeetingsController.getMeetingsList(req.query);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.get('/meeting/:id', async (req: any, res: any, next) => {
    try {
        const result = await MeetingsController.getMeetingsList(req.params);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

module.exports = app;
