import express, { Request, Response } from 'express';
import { app } from '../index';
import FinancialAidProgrammesController from './FinancialAidProgrammesController';

export const financialAidProgrammesRouter = express.Router();
app.post(
    '/financialAidProgrammes',
    async (req: Request, res: Response, next) => {
        try {
            const orConditions = req.parsedBody.orConditions;
            const result = await FinancialAidProgrammesController.find(
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
            const item = await FinancialAidProgrammesController.addFromDto(
                req.parsedBody ?? req.body
            );
            res.send(item);
        } catch (error) {
            next(error);
        }
    }
);

app.put(
    '/financialAidProgramme/:id',
    async (req: Request, res: Response, next) => {
        try {
            const fieldsToUpdate = req.parsedBody._fieldsToUpdate;
            const item = await FinancialAidProgrammesController.editFromDto(
                req.parsedBody,
                fieldsToUpdate
            );
            res.send(item);
        } catch (error) {
            next(error);
        }
    }
);

app.delete(
    '/financialAidProgramme/:id',
    async (req: Request, res: Response, next) => {
        try {
            await FinancialAidProgrammesController.deleteFromDto(req.body);
            res.send({ id: req.body.id });
        } catch (error) {
            next(error);
        }
    }
);
