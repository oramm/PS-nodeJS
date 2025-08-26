import { Request, Response } from 'express';
import NeedsFocusAreasController from './NeedsFocusAreasController';
import { app } from '../../index';

app.post('/needsFocusAreas', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await NeedsFocusAreasController.find(orConditions);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.post('/needFocusArea', async (req: Request, res: Response, next) => {
    try {
        const item = await NeedsFocusAreasController.addNewNeedFocusArea(req.body);
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.put('/needFocusArea/:id', async (req: Request, res: Response, next) => {
    try {
        const fieldsToUpdate = req.parsedBody.fieldsToUpdate;  
        const item = await NeedsFocusAreasController.updateNeedFocusArea(req.body, fieldsToUpdate);
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.delete('/needFocusArea/:id', async (req: Request, res: Response, next) => {
    try {
        const result = await NeedsFocusAreasController.deleteNeedFocusArea(req.body);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});
