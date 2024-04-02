import express, { Request, Response } from 'express';
import { app } from '../index';
import FinancialAidProgrammesController from './FinancialAidProgrammesController';
import FinancialAidProgramme from './FinancialAidProgramme';
import ToolsGapi from '../setup/GAuth2/ToolsGapi';

export const financialAidProgrammesRouter = express.Router();
app.post('/financialAidProgrammes', async (req: Request, res: Response) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result =
            await FinancialAidProgrammesController.getFinancialAidProgrammesList(
                orConditions
            );
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/financialAidProgramme', async (req: Request, res: Response) => {
    try {
        let item = new FinancialAidProgramme(req.body);
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            item.addNewController,
            undefined,
            item
        );
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.put('/financialAidProgramme/:id', async (req: Request, res: Response) => {
    try {
        let item = new FinancialAidProgramme(req.parsedBody);
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
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.delete(
    '/financialAidProgramme/:id',
    async (req: Request, res: Response) => {
        try {
            let item = new FinancialAidProgramme(req.body);
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
            if (error instanceof Error)
                res.status(500).send({ errorMessage: error.message });
        }
    }
);
