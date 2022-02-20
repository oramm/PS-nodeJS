import TasksTemplatesForProcessesController from './TasksTemplatesForProcessesController'
import { app } from '../../../../../index';
import TasksTemplateForProcess from './TaskTemplateForProcess';

app.get('/tasksTemplatesForProcesses', async (req: any, res: any) => {
    try {
        var result = await TasksTemplatesForProcessesController.getTasksTemplateForProcesssList(req.query);
        res.send(result);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }
});

app.get('/tasksTemplateForProcess/:id', async (req: any, res: any) => {
    try {
        var result = await TasksTemplatesForProcessesController.getTasksTemplateForProcesssList(req.params);
        res.send(result);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
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
            res.status(500).send(error.message);
        console.log(error);
    };
});

app.put('/tasksTemplateForProcess/:id', async (req: any, res: any) => {
    try {
        let item = new TasksTemplateForProcess(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }
});

app.delete('/tasksTemplateForProcess/:id', async (req: any, res: any) => {
    try {
        let item = new TasksTemplateForProcess(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }
});