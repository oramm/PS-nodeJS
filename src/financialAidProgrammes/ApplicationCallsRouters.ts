import { Request, Response } from 'express';
import ApplicationCallsController from './ApplicationCallsController';
import ApplicationCall from './ApplicationCall';
import { app } from '../index';

app.post('/applicationCalls', async (req: Request, res: Response) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await ApplicationCallsController.getApplicationCallsList(
            orConditions
        );
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.post('/applicationCall', async (req: Request, res: Response) => {
    try {
        let applicationCall = new ApplicationCall(req.body);
        await applicationCall.addInDb();
        res.send(applicationCall);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.put('/applicationCall/:id', async (req: Request, res: Response) => {
    try {
        let applicationCall = new ApplicationCall(req.parsedBody);
        await applicationCall.editInDb();
        res.send(applicationCall);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.delete('/applicationCall/:id', async (req: Request, res: Response) => {
    try {
        let applicationCall = new ApplicationCall(req.body);
        await applicationCall.deleteFromDb();
        res.send(applicationCall);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});
