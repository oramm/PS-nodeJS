import MilestoneTemplatesController from './MilestoneTemplatesController'
import { app } from '../../../index';
import MilestoneTemplate from './MilestoneTemplate';

app.get('/milestoneTemplates', async (req: any, res: any) => {
    try {
        const result = await MilestoneTemplatesController.getMilestoneTemplatesList(req.query);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.get('/milestoneTemplate/:id', async (req: any, res: any) => {
    try {
        const result = await MilestoneTemplatesController.getMilestoneTemplatesList(req.params);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/milestoneTemplate', async (req: any, res: any) => {
    try {
        let item = new MilestoneTemplate(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    };
});

app.put('/milestoneTemplate/:id', async (req: any, res: any) => {
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

app.delete('/milestoneTemplate/:id', async (req: any, res: any) => {
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