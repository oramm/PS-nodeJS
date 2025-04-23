import { Request, Response } from 'express';
import FocusAreasController from './FocusAreasController';
import FocusArea from './FocusArea';
import { app } from '../../index';
import ToolsGapi from '../../setup/Sessions/ToolsGapi';

app.post('/focusAreas', async (req: Request, res: Response) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await FocusAreasController.getFocusAreasList(
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

app.post('/focusArea', async (req: Request, res: Response) => {
    try {
        const item = new FocusArea(req.body);
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

app.put('/focusArea/:id', async (req: Request, res: Response) => {
    try {
        const item = new FocusArea(req.parsedBody);
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

app.delete('/focusArea/:id', async (req: Request, res: Response) => {
    try {
        const item = new FocusArea(req.body);
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
