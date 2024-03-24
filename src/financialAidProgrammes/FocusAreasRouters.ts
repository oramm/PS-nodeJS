import { Request, Response } from 'express';
import FocusAreasController from './FocusAreasController';
import FocusArea from './FocusArea';
import { app } from '../index';

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
        let focusArea = new FocusArea(req.body);
        await focusArea.addInDb();
        res.send(focusArea);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.put('/focusArea/:id', async (req: Request, res: Response) => {
    try {
        let focusArea = new FocusArea(req.parsedBody);
        await focusArea.editInDb();
        res.send(focusArea);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.delete('/focusArea/:id', async (req: Request, res: Response) => {
    try {
        let focusArea = new FocusArea(req.body);
        await focusArea.deleteFromDb(); // Assuming deleteFromDb is a method in FocusArea
        res.send(focusArea);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});
