import TaskTemplatesController from './TaskTemplatesController'
import { app } from '../../../../../index';
import TaskTemplate from './TaskTemplate';

app.get('/taskTemplates', async (req: any, res: any) => {
    try {
        const result = await TaskTemplatesController.getTaskTemplatesList(req.query);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.get('/taskTemplate/:id', async (req: any, res: any) => {
    try {
        const result = await TaskTemplatesController.getTaskTemplatesList(req.params);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/taskTemplate', async (req: any, res: any) => {
    try {
        let item = new TaskTemplate(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    };
});

app.put('/taskTemplate/:id', async (req: any, res: any) => {
    try {
        let item = new TaskTemplate(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.delete('/taskTemplate/:id', async (req: any, res: any) => {
    try {
        let item = new TaskTemplate(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});