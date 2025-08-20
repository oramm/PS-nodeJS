import express, { Request, Response } from 'express';
import { app } from '../../index';
import CitiesController from './CitiesController';

app.post('/cities', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await CitiesController.find(orConditions);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/city', async (req: Request, res: Response, next) => {
    try {
        const item = await CitiesController.addNewCity(req.parsedBody);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/city/:id', async (req: Request, res: Response, next) => {
    try {
        const fieldsToUpdate = req.parsedBody._fieldsToUpdate;
        const itemFromClient = req.parsedBody;
        if (!itemFromClient || !itemFromClient.id)
            throw new Error(`Próba edycji  bez Id`);

        const updateCity = await CitiesController.updateCity(itemFromClient, fieldsToUpdate);
        res.send(updateCity);
    } catch (error) {
        next(error);
    }
});

app.delete('/city/:id', async (req: Request, res: Response, next) => {
    try {
        const itemFromClient = req.parsedBody;
        if (!itemFromClient || !itemFromClient.id)
            throw new Error(`Próba edycji  bez Id`);
        
        await CitiesController.deleteCity(itemFromClient);
        res.json({ id: itemFromClient.id, name: itemFromClient.name });
    } catch (error) {
        next(error);
    }
});
