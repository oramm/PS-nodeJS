import { Request, Response } from 'express';
import { app } from '../../../index';
import ToolsGapi from '../../../setup/Sessions/ToolsGapi';
import { OAuth2Client } from 'google-auth-library';
import ApplicationCallsController from './ApplicationCallsController';

app.post('/applicationCalls', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await ApplicationCallsController.find(orConditions);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/applicationCall', async (req: Request, res: Response, next) => {
    try {
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            async (auth: OAuth2Client) => {
                const item = await ApplicationCallsController.addNewApplicationCall(req.body, auth);
                res.send(item);
            }
        );
    } catch (error) {
        next(error);
    }
});

app.put('/applicationCall/:id', async (req: Request, res: Response, next) => {
    try {
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            async (auth: OAuth2Client) => {
                const fieldstoUpdate = req.parsedBody._fieldstoUpdate;
                const item = await ApplicationCallsController.updateApplicationCall(req.parsedBody, fieldstoUpdate, auth);
                res.send(item)
            }
        );
    } catch (error) {
        console.error(error);
        if (error instanceof Error){
            res.status(500).send({errorMessage: error.message});
        }    
    }
});

app.delete('/applicationCall/:id', async (req: Request, res: Response, next) => {
    try {
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            async (auth: OAuth2Client) => {
                const result = await ApplicationCallsController.deleteApplicationCall(req.body, auth);
                res.json({ message: 'Application call deleted', result});
            }
        );
    } catch (error) {
        next(error);
    }
});