import DocumentTemplatesController from './DocumentTemplatesController'
import { app } from '../index';
import DocumentTemplate from './DocumentTemplate';
import { Request, Response } from 'express';

app.post('/documentTemplates', async (req: Request, res: Response) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await DocumentTemplatesController.getDocumentTemplatesList(orConditions);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/documentTemplate', async (req: any, res: any) => {
    try {
        let item = new DocumentTemplate(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    };
});

app.put('/documentTemplate/:id', async (req: any, res: any) => {
    try {
        let item = new DocumentTemplate(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.delete('/documentTemplate/:id', async (req: any, res: any) => {
    try {
        let item = new DocumentTemplate(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});