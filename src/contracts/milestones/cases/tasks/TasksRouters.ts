import TasksController from './TasksController';
import { app } from '../../../../index';
import { Request, Response } from 'express';

app.post('/tasks', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await TasksController.find(orConditions);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/task', async (req: Request, res: Response, next) => {
    try {
        const item = await TasksController.add(req.body);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/task/:id', async (req: Request, res: Response, next) => {
    try {
        const fieldsToUpdate = req.parsedBody._fieldsToUpdate;
        const item = await TasksController.edit(req.parsedBody, fieldsToUpdate);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/task/:id', async (req: Request, res: Response, next) => {
    try {
        const result = await TasksController.delete(req.body);
        res.send(result);
    } catch (error) {
        next(error);
    }
});
