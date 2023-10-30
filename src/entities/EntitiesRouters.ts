import bodyParser from 'body-parser';
import express, { Request, Response } from 'express';
import EntitiesController from './EntitiesController';
import Entity from './Entity';
import { app } from '../index'


app.post('/entities', async (req: Request, res: Response) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await EntitiesController.getEntitiesList(orConditions);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/entity', async (req: Request, res: Response) => {
    try {
        let item = new Entity(req.body);
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    };
});

app.put('/entity/:id', async (req: Request, res: Response) => {
    try {
        let item = new Entity(req.body);
        console.log(req.body);
        await item.editInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.delete('/entity/:id', async (req: Request, res: Response) => {
    try {
        let item = new Entity(req.body);
        console.log('delete');
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

