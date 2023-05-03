import TasksTemplatesForProcessesController from './TasksTemplatesForProcessesController'
import { app } from '../../../../../index';
import TasksTemplateForProcess from './TaskTemplateForProcess';

app.get('/tasksTemplatesForProcesses', async (req: any, res: any) => {
    try {
        const result = await TasksTemplatesForProcessesController.getTasksTemplateForProcesssList(req.query);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.get('/tasksTemplateForProcess/:id', async (req: any, res: any) => {
    try {
        const result = await TasksTemplatesForProcessesController.getTasksTemplateForProcesssList(req.params);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.post('/tasksTemplateForProcess', async (req: any, res: any) => {
    try {
        let item = new TasksTemplateForProcess(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    };
});

app.put('/tasksTemplateForProcess/:id', async (req: any, res: any) => {
    try {
        let item = new TasksTemplateForProcess(req.body);
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

app.delete('/tasksTemplateForProcess/:id', async (req: any, res: any) => {
    try {
        let item = new TasksTemplateForProcess(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});