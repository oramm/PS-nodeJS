import MilestoneTemplatesController from './MilestoneTemplatesController'
import { app } from '../../../index';
import MilestoneTemplate from './MilestoneTemplate';

app.get('/milestoneTemplates', async (req: any, res: any) => {
    try {
        var result = await MilestoneTemplatesController.getMilestoneTemplatesList(req.query);
        res.send(result);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

app.get('/milestoneTemplate/:id', async (req: any, res: any) => {
    try {
        var result = await MilestoneTemplatesController.getMilestoneTemplatesList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post('/milestoneTemplate', async (req: any, res: any) => {
    try {
        let item = new MilestoneTemplate(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        res.status(500).send(error.message);
        console.log(error);
    };
});

app.put('/milestoneTemplate/:id', async (req: any, res: any) => {
    try {
        let item = new MilestoneTemplate(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.delete('/milestoneTemplate/:id', async (req: any, res: any) => {
    try {
        let item = new MilestoneTemplate(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (err) {
        res.status(500).send(err.message);
    }
});