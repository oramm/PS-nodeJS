import MilestoneTemplatesController from './MilestoneTemplatesController';
import { app } from '../../../index';
import MilestoneTemplate from './MilestoneTemplate';
import { Request, Response } from 'express';
import PersonsController from '../../../persons/PersonsController';

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
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }
        const _editor = await PersonsController.getPersonFromSessionUserData(
            req.session.userData
        );
        let item = new MilestoneTemplate({ ...req.parsedBody, _editor });
        await item.addInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/milestoneTemplate/:id', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }
        const _editor = await PersonsController.getPersonFromSessionUserData(
            req.session.userData
        );
        let item = new MilestoneTemplate({ ...req.parsedBody, _editor });
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
