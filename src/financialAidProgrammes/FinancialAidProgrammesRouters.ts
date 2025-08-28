import express, { Request, Response } from 'express';
import { app } from '../index';
import FinancialAidProgrammesController from './FinancialAidProgrammesController';
import ToolsGapi from '../setup/Sessions/ToolsGapi';
import { OAuth2Client } from 'google-auth-library';

export const financialAidProgrammesRouter = express.Router();
app.post(
    '/financialAidProgrammes',
    async (req: Request, res: Response, next) => {
        try {
            const orConditions = req.parsedBody.orConditions;
            const result =
                await FinancialAidProgrammesController.find(
                    orConditions
                );
            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);

app.post(
    '/financialAidProgramme',
    async (req: Request, res: Response, next) => {
        try {
            await ToolsGapi.gapiReguestHandler(
                req,
                res,
                async (auth: OAuth2Client) => {
                    const item = await FinancialAidProgrammesController.addNewFinancialAidProgramme(req.body, auth);
                    res.send(item);
                }
            );
        } catch (error) {
            if (error instanceof Error)
                res.status(500).send({ errorMessage: error.message });
            console.error(error);
        }
    }
);

app.put(
    '/financialAidProgramme/:id',
    async (req: Request, res: Response, next) => {
        try {
            await ToolsGapi.gapiReguestHandler(
                req,
                res,
                async (auth: OAuth2Client) => {
                    const fieldsToUpdate = req.parsedBody._fieldsToUpdate;
                    const item = await FinancialAidProgrammesController.updateFinancialAidProgramme(req.parsedBody, fieldsToUpdate, auth);
                    res.send(item);
                }
            );
        } catch (error) {
            next(error);
        }
    }
);

app.delete(
    '/financialAidProgramme/:id',
    async (req: Request, res: Response) => {
        try {
            await ToolsGapi.gapiReguestHandler(
                req,
                res,
                async (auth: OAuth2Client) => {
                    await FinancialAidProgrammesController.deleteFinancialAidProgramme(req.body, auth);
                    res.send({ id: req.body.id });
                }
            );
        } catch (error) {
            console.error(error);
            if (error instanceof Error)
                res.status(500).send({ errorMessage: error.message });
        }
    }
);
