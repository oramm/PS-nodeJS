import ToolsGapi from '../../../../setup/Sessions/ToolsGapi';
import Task from './Task';
import TasksController from './TasksController';
import { app } from '../../../../index';
import { Request, Response } from 'express';

app.post('/tasks', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await TasksController.getTasksList(orConditions);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/task', async (req: Request, res: Response, next) => {
    try {
        let item = new Task({ ...req.body, _parent: req.body._case });
        await item.addInDb();
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            item.addInScrum,
            undefined,
            item
        );
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/task/:id', async (req: Request, res: Response, next) => {
    try {
        const _fieldsToUpdate = req.parsedBody._fieldsToUpdate;
        const itemFromClient = req.parsedBody;

        let item = new Task(itemFromClient);
        await Promise.all([
            ToolsGapi.gapiReguestHandler(
                req,
                res,
                item.editInScrum,
                undefined,
                item
            ),
            item.editInDb(),
        ]);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/task/:id', async (req: Request, res: Response, next) => {
    try {
        let item = new Task(req.body);
        console.log('delete');
        await Promise.all([
            item.deleteFromDb(),
            ToolsGapi.gapiReguestHandler(
                req,
                res,
                item.deleteFromScrum,
                undefined,
                item
            ),
        ]);
        res.send(item);
    } catch (error) {
        next(error);
    }
});
