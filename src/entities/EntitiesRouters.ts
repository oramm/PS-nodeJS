import bodyParser from 'body-parser';
import express from 'express';
import Joi from 'joi';
import EntitiesController from './EntitiesController';
import Entity from './Entity';
import { app } from '../index'


app.get('/entities', async (req: any, res: any) => {
    try {
        var result = await EntitiesController.getEntitiesList(req.query);
        res.send(result);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }
});

app.get('/entity/:id', async (req: any, res: any) => {
    try {
        var result = await EntitiesController.getEntitiesList(req.params);
        res.send(result);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }
});

app.post('/entity', async (req: any, res: any) => {
    try {
        const schema = {
            name: Joi.string(),
        };
        let item = new Entity(req.body);
        await item.addInDb();
        res.send(item);
    } catch (error) {
        res.status(500).send(error.message);
        console.log(error);
    };
});

app.put('/entity/:id', async (req: any, res: any) => {
    try {
        let item = new Entity(req.body);
        console.log(req.body);
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }
});

app.delete('/entity/:id', async (req: any, res: any) => {
    try {
        let item = new Entity(req.body);
        console.log('delete');
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }
});

