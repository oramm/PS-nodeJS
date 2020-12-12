import express from 'express'
import MeetingsController from './MeetingsController'
var app = express();

app.get('/meetings', async (req: any, res: any) => {
    try {
        var result = await MeetingsController.getMeetingsList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.get('/meeting/:id', async (req: any, res: any) => {
    try {
        var result = await MeetingsController.getMeetingsList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;