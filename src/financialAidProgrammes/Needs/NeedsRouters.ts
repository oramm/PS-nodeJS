import { Request, Response } from 'express';
import NeedsController from './NeedsController';
import Need from './Need';
import { app } from '../../index';

app.post('/needs', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await NeedsController.getNeedsList(orConditions);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.post('/need', async (req: Request, res: Response, next) => {
    try {
        let need = new Need(req.body);
        await need.addNewController();
        res.send(need);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.put('/need/:id', async (req: Request, res: Response, next) => {
    try {
        let need = new Need(req.parsedBody);
        await need.editController();
        res.send(need);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.delete('/need/:id', async (req: Request, res: Response, next) => {
    try {
        let need = new Need(req.body);
        await need.deleteController();
        res.send(need);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});
