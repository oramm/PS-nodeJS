import CaseTemplatesController from './CaseTemplatesController'
import { app } from '../../../../index';
import CaseTemplate from './CaseTemplate';

app.get('/caseTemplates', async (req: any, res: any) => {
    try {
        var result = await CaseTemplatesController.getCaseTemplatesList(req.query);
        res.send(result);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

app.get('/caseTemplate/:id', async (req: any, res: any) => {
    try {
        var result = await CaseTemplatesController.getCaseTemplatesList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post('/caseTemplate', async (req: any, res: any) => {
    try {
        let item = new CaseTemplate(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        res.status(500).send(error.message);
        console.log(error);
    };
});

app.put('/caseTemplate/:id', async (req: any, res: any) => {
    try {
        let item = new CaseTemplate(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.delete('/caseTemplate/:id', async (req: any, res: any) => {
    try {
        let item = new CaseTemplate(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (err) {
        res.status(500).send(err.message);
    }
});