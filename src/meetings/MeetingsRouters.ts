import express from 'express'
import MeetingsController from './MeetingsController'
var app = express();

app.get('/meetings', async (req: any, res: any) => {
    try {
        var result = await MeetingsController.getMeetingsList(req.query);
        res.send(result);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }


});

app.get('/meeting/:id', async (req: any, res: any) => {
    try {
        var result = await MeetingsController.getMeetingsList(req.params);
        res.send(result);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }


});

module.exports = app;