import TaskTemplatesController from './TaskTemplatesController'
import { app } from '../../../../../index';
import TaskTemplate from './TaskTemplate';

app.get('/taskTemplates', async (req: any, res: any) => {
    try {
        var result = await TaskTemplatesController.getTaskTemplatesList(req.query);
        res.send(result);
    } catch (err) {
        console.error(err);
        res.status(500).send(err.message);
    }
});

app.get('/taskTemplate/:id', async (req: any, res: any) => {
    try {
        var result = await TaskTemplatesController.getTaskTemplatesList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.post('/taskTemplate', async (req: any, res: any) => {
    try {
        let item = new TaskTemplate(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        res.status(500).send(error.message);
        console.log(error);
    };
});

app.put('/taskTemplate/:id', async (req: any, res: any) => {
    try {
        let item = new TaskTemplate(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.delete('/taskTemplate/:id', async (req: any, res: any) => {
    try {
        let item = new TaskTemplate(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (err) {
        res.status(500).send(err.message);
    }
});