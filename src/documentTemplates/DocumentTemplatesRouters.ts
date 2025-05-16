import DocumentTemplatesController from './DocumentTemplatesController';
import { app } from '../index';
import DocumentTemplate from './DocumentTemplate';
import { Request, Response } from 'express';

app.post('/documentTemplates', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result =
            await DocumentTemplatesController.getDocumentTemplatesList(
                orConditions
            );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/documentTemplate', async (req: any, res: any, next) => {
    try {
        let item = new DocumentTemplate(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/documentTemplate/:id', async (req: any, res: any, next) => {
    try {
        let item = new DocumentTemplate(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/documentTemplate/:id', async (req: any, res: any, next) => {
    try {
        let item = new DocumentTemplate(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});
