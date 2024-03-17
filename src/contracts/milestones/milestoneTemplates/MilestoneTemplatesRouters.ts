import MilestoneTemplatesController from './MilestoneTemplatesController';
import { app } from '../../../index';
import MilestoneTemplate from './MilestoneTemplate';
import { Request, Response } from 'express';

app.post('/milestoneTemplates', async (req: Request, res: Response) => {
    try {
        const result =
            await MilestoneTemplatesController.getMilestoneTemplatesList(
                req.parsedBody,
                req.parsedBody.templateType
            );
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/milestoneTemplate', async (req: Request, res: Response) => {
    try {
        let item = new MilestoneTemplate(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.put('/milestoneTemplate/:id', async (req: Request, res: Response) => {
    try {
        let item = new MilestoneTemplate(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.delete('/milestoneTemplate/:id', async (req: Request, res: Response) => {
    try {
        let item = new MilestoneTemplate(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});
