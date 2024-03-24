import express, { Request, Response } from 'express';
import { app } from '../index';
import FinancialAidProgrammesController from './FinancialAidProgrammesController';
import FinancialAidProgramme from './FinancialAidProgramme';

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
        await item.addInDb(); // Assuming addInDb is a method to add the item in the database
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
        await item.editInDb(); // Assuming editInDb is a method to edit the item in the database
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
            await item.deleteFromDb(); // Assuming deleteFromDb is a method to delete the item from the database
            res.send(item);
        } catch (error) {
            console.error(error);
            if (error instanceof Error)
                res.status(500).send({ errorMessage: error.message });
        }
    }
);
