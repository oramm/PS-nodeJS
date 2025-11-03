import ToolsGapi from '../../../../setup/Sessions/ToolsGapi';
import TasksController from './TasksController';
import { app } from '../../../../index';
import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';

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
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            async (auth: OAuth2Client) => {
                const item = await TasksController.addNewTask(req.body, auth);
                res.send(item);
            }
        );
    } catch (error) {
        next(error);
    }
});

app.put('/task/:id', async (req: Request, res: Response, next) => {
    try {
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            async (auth: OAuth2Client) => {
                const fieldsToUpdate = req.parsedBody._fieldsToUpdate;
                const item = await TasksController.updateTask(
                    req.parsedBody,
                    fieldsToUpdate,
                    auth
                );
                res.send(item);
            }
        );
    } catch (error) {
        next(error);
    }
});

app.delete('/task/:id', async (req: Request, res: Response, next) => {
    try {
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            async (auth: OAuth2Client) => {
                const result = await TasksController.deleteTask(req.body, auth);
                res.send(result);
            }
        );
    } catch (error) {
        next(error);
    }
});
