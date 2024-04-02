import { Request, Response } from 'express';
import ApplicationCallsController from './ApplicationCallsController';
import ApplicationCall from './ApplicationCall';
import { app } from '../../../index';
import ToolsGapi from '../../../setup/GAuth2/ToolsGapi';

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
        const item = new ApplicationCall(req.body);
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            item.addNewController,
            undefined,
            item
        );
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.put('/applicationCall/:id', async (req: Request, res: Response) => {
    try {
        const item = new ApplicationCall(req.parsedBody);
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            item.editController,
            undefined,
            item
        );
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.delete('/applicationCall/:id', async (req: Request, res: Response) => {
    try {
        const item = new ApplicationCall(req.body);
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            item.deleteController,
            undefined,
            item
        );
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});
