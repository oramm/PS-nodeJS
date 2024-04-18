import { Request, Response } from 'express';
import NeedsFocusAreasController from './NeedsFocusAreasController';
import NeedFocusArea from './NeedFocusArea';
import { app } from '../../index';

app.post('/needsFocusAreas', async (req: Request, res: Response) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await NeedsFocusAreasController.getNeedsFocusAreasList(
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

app.post('/needFocusArea', async (req: Request, res: Response) => {
    try {
        let needFocusArea = new NeedFocusArea(req.parsedBody);
        await needFocusArea.addInDb();
        res.send(needFocusArea);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.put('/needFocusArea/:id', async (req: Request, res: Response) => {
    try {
        let needFocusArea = new NeedFocusArea(req.parsedBody);
        await needFocusArea.editInDb();
        res.send(needFocusArea);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

app.delete('/needFocusArea/:id', async (req: Request, res: Response) => {
    try {
        let needFocusArea = new NeedFocusArea(req.body);
        await needFocusArea.deleteFromDb();
        res.send(needFocusArea);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});
