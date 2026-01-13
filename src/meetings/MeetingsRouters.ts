import express from 'express';
import MeetingsController from './MeetingsController';
var app = express();

app.get('/meetings', async (req: any, res: any, next) => {
    try {
        const result = await MeetingsController.find([req.query]);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.get('/meeting/:id', async (req: any, res: any, next) => {
    try {
        const result = await MeetingsController.find([{ id: req.params.id }]);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

module.exports = app;
