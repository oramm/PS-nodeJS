import express, { Request, Response } from 'express';
import { app } from '../../index';
import CitiesController from './CitiesController';
import City from './City';

app.post('/cities', async (req: Request, res: Response) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await CitiesController.getCitiesList(orConditions);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/city', async (req: Request, res: Response) => {
    try {
        const item = new City(req.parsedBody);
        await item.addNewController();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.put('/city/:id', async (req: Request, res: Response) => {
    try {
        const _fieldsToUpdate = req.parsedBody._fieldsToUpdate;
        const itemFromClient = req.parsedBody;
        if (!itemFromClient || !itemFromClient.id)
            throw new Error(`Próba edycji  bez Id`);

        const item = new City(itemFromClient);
        item.editInDb(undefined, false, _fieldsToUpdate);
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.delete('/city/:id', async (req: Request, res: Response) => {
    try {
        const item = new City(req.parsedBody);
        await item.deleteFromDb();
        res.send(item);
        console.log(`City ${item.name} deleted`);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});
