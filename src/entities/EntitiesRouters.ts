import bodyParser from 'body-parser';
import express from 'express';
import EntitiesController from './EntitiesController';
import Entity from './Entity';
import { app } from '../index'


app.get('/entities', async (req: any, res: any) => {
    try {
        const result = await EntitiesController.getEntitiesList(req.query);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.get('/entity/:id', async (req: any, res: any) => {
    try {
        const result = await EntitiesController.getEntitiesList(req.params);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.post('/entity', async (req: any, res: any) => {
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

app.put('/entity/:id', async (req: any, res: any) => {
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

app.delete('/entity/:id', async (req: any, res: any) => {
    try {
        let item = new Entity(req.body);
        console.log('delete');
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

