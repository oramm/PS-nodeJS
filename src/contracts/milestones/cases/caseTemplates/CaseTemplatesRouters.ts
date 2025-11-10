import CaseTemplatesController from './CaseTemplatesController';
import { app } from '../../../../index';
import CaseTemplate from './CaseTemplate';
import PersonsController from '../../../../persons/PersonsController';
import { Request, Response } from 'express';

app.get('/caseTemplates', async (req: Request, res: Response, next) => {
    try {
        const result = await CaseTemplatesController.getCaseTemplatesList(
            req.query
        );
        res.send(result);
    } catch (err) {
        console.error(err);
        if (err instanceof Error) res.status(500).send(err.message);
    }
});

app.get('/caseTemplate/:id', async (req: Request, res: Response, next) => {
    try {
        const result = await CaseTemplatesController.getCaseTemplatesList(
            req.params
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/caseTemplate', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }
        const _editor = await PersonsController.getPersonFromSessionUserData(
            req.session.userData
        );
        let item = new CaseTemplate({ ...req.parsedBody, _editor });
        await item.addInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/caseTemplate/:id', async (req: Request, res: Response, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }
        const _editor = await PersonsController.getPersonFromSessionUserData(
            req.session.userData
        );
        let item = new CaseTemplate({ ...req.parsedBody, _editor });
        await item.editInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/caseTemplate/:id', async (req: Request, res: Response, next) => {
    try {
        let item = new CaseTemplate(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});
