import DocumentTemplatesController from './DocumentTemplatesController'
import { app } from '../index';
import DocumentTemplate from './DocumentTemplate';

app.get('/documentTemplates', async (req: any, res: any) => {
    try {
        const result = await DocumentTemplatesController.getDocumentTemplatesList(req.query);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
    }


});

app.get('/documentTemplate/:id', async (req: any, res: any) => {
    try {
        const result = await DocumentTemplatesController.getDocumentTemplatesList(req.params);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.error(error);
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
            res.status(500).send(error.message);
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
            res.status(500).send(error.message);
        console.error(error);
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
            res.status(500).send(error.message);
        console.error(error);
    }
});