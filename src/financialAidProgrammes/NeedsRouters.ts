import { Request, Response } from 'express';
import NeedsController from './NeedsController';
import Need from './Need';
import { app } from '../index';

app.post('/needs', async (req: Request, res: Response) => {
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

app.post('/need', async (req: Request, res: Response) => {
    try {
        let need = new Need(req.body);
        await need.addInDb();
        res.send(need);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.put('/need/:id', async (req: Request, res: Response) => {
    try {
        let need = new Need(req.parsedBody);
        await need.editInDb();
        res.send(need);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.delete('/need/:id', async (req: Request, res: Response) => {
    try {
        let need = new Need(req.body);
        await need.deleteFromDb();
        res.send(need);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});
