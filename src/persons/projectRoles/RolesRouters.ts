import RolesController from './RolesController';
import { app } from '../../index';
import { Request, Response } from 'express';

app.post('/roles', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await RolesController.find(orConditions);
        res.send(result);
    } catch (err) {
        if (err instanceof Error) {
            res.status(500).send(err.message);
            console.error(err);
        }
    }
});

app.post('/role', async (req: Request, res: Response, next) => {
    try {
        const item = await RolesController.addNewRole(req.parsedBody);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/role/:id', async (req: Request, res: Response, next) => {
    try {
        const item = await RolesController.updateRole(req.parsedBody);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/role/:id', async (req: Request, res: Response, next) => {
    try {
        const item = await RolesController.deleteRole(req.parsedBody);
        res.send(item);
    } catch (error) {
        next(error);
    }
});
