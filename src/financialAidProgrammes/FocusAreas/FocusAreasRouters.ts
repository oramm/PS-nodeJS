import { Request, Response } from 'express';
import FocusAreasController from './FocusAreasController';
import { app } from '../../index';
import ToolsGapi from '../../setup/Sessions/ToolsGapi';
import { OAuth2Client } from 'google-auth-library';

app.post('/focusAreas', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await FocusAreasController.find(
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

app.post('/focusArea', async (req: Request, res: Response, next) => {
    try {
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            async (auth: OAuth2Client) => {
                const item = await FocusAreasController.addNewFocusArea(req.body, auth);
                res.send(item);
            }
        );
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.put('/focusArea/:id', async (req: Request, res: Response, next) => {
    try {
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            async (auth: OAuth2Client) => {
                const fieldsToUpdate = req.parsedBody._fieldsToUpdate;
                const item = await FocusAreasController.updateFocusArea(req.parsedBody, fieldsToUpdate, auth);
                res.send(item);
            }
        );
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.delete('/focusArea/:id', async (req: Request, res: Response, next) => {
    try {
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            async (auth: OAuth2Client) => {
                const result = await FocusAreasController.deleteFocusArea(req.body, auth);
                res.json({message: 'FocusArea deleted', id: req.body.id });
            }
        );
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});
