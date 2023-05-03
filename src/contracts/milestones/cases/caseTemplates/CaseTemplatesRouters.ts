import CaseTemplatesController from './CaseTemplatesController'
import { app } from '../../../../index';
import CaseTemplate from './CaseTemplate';

app.get('/caseTemplates', async (req: any, res: any) => {
    try {
        const result = await CaseTemplatesController.getCaseTemplatesList(req.query);
        res.send(result);
    } catch (err) {
        console.error(err);
        if (err instanceof Error)
            res.status(500).send(err.message);
    }
});

app.get('/caseTemplate/:id', async (req: any, res: any) => {
    try {
        const result = await CaseTemplatesController.getCaseTemplatesList(req.params);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.post('/caseTemplate', async (req: any, res: any) => {
    try {
        let item = new CaseTemplate(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    };
});

app.put('/caseTemplate/:id', async (req: any, res: any) => {
    try {
        let item = new CaseTemplate(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.delete('/caseTemplate/:id', async (req: any, res: any) => {
    try {
        let item = new CaseTemplate(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});