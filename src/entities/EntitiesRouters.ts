import express, { Request, Response } from 'express';
import EntitiesController from './EntitiesController';
import { app } from '../index';

app.post('/entities', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await EntitiesController.find(orConditions);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/entity', async (req: Request, res: Response, next) => {
    try {
        let item = await EntitiesController.addNewEntity(req.body);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/entity/:id', async (req: Request, res: Response, next) => {
    try {
        let item = await EntitiesController.updateEntity(req.body);
        console.log(req.body);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/entity/:id', async (req: Request, res: Response, next) => {
    try {
        if (!req.parsedBody || !req.parsedBody.id)
            throw new Error(`Próba usunięcia bez Id`);
        await EntitiesController.deleteEntity(req.parsedBody);
        res.json({ id: req.parsedBody.id, name: req.parsedBody.name });
    } catch (error) {
        next(error);
    }
});
