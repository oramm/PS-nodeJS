import express from 'express'
import TasksController from './TasksController'
var app = express();

app.get('/tasks', async (req: any, res: any) => {
    try {
        var result = await TasksController.getTasksList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.get('/task/:id', async (req: any, res: any) => {
    try {
        var result = await TasksController.getTasksList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;