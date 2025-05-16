import MilestoneTemplatesController from './MilestoneTemplatesController';
import { app } from '../../../index';
import MilestoneTemplate from './MilestoneTemplate';
import { Request, Response } from 'express';

app.post('/milestoneTemplates', async (req: Request, res: Response, next) => {
    try {
        const result =
            await MilestoneTemplatesController.getMilestoneTemplatesList(
                req.parsedBody,
                req.parsedBody.templateType
            );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/milestoneTemplate', async (req: Request, res: Response, next) => {
    try {
        let item = new MilestoneTemplate(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/milestoneTemplate/:id', async (req: Request, res: Response, next) => {
    try {
        let item = new MilestoneTemplate(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete(
    '/milestoneTemplate/:id',
    async (req: Request, res: Response, next) => {
        try {
            let item = new MilestoneTemplate(req.body);
            await item.deleteFromDb();
            res.send(item);
        } catch (error) {
            next(error);
        }
    }
);
