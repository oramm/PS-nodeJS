import DocumentTemplatesController from './DocumentTemplatesController'
import { app } from '../index';
import DocumentTemplate from './DocumentTemplate';

app.get('/documentTemplates', async (req: any, res: any) => {
    try {
        var result = await DocumentTemplatesController.getDocumentTemplatesList(req.query);
        res.send(result);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }


});

app.get('/documentTemplate/:id', async (req: any, res: any) => {
    try {
        var result = await DocumentTemplatesController.getDocumentTemplatesList(req.params);
        res.send(result);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }


});

app.post('/documentTemplate', async (req: any, res: any) => {
    try {
        let item = new DocumentTemplate(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        res.status(500).send(error.message);
        console.log(error);
    };
});

app.put('/documentTemplate/:id', async (req: any, res: any) => {
    try {
        let item = new DocumentTemplate(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }
});

app.delete('/documentTemplate/:id', async (req: any, res: any) => {
    try {
        let item = new DocumentTemplate(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }
});