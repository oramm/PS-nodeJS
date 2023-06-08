import express from 'express'
import MeetingsController from './MeetingsController'
var app = express();

app.get('/meetings', async (req: any, res: any) => {
    try {
        const result = await MeetingsController.getMeetingsList(req.query);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }


});

app.get('/meeting/:id', async (req: any, res: any) => {
    try {
        const result = await MeetingsController.getMeetingsList(req.params);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }


});

module.exports = app;