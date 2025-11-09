import TaskTemplatesController from './TaskTemplatesController';
import { app } from '../../../../../index';
import TaskTemplate from './TaskTemplate';
import PersonsController from '../../../../../persons/PersonsController';

app.get('/taskTemplates', async (req: any, res: any, next) => {
    try {
        const result = await TaskTemplatesController.getTaskTemplatesList(
            req.query
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.get('/taskTemplate/:id', async (req: any, res: any, next) => {
    try {
        const result = await TaskTemplatesController.getTaskTemplatesList(
            req.params
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/taskTemplate', async (req: any, res: any, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }
        const _editor = await PersonsController.getPersonFromSessionUserData(
            req.session.userData
        );
        let item = new TaskTemplate({ ...req.parsedBody, _editor });
        await item.addInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/taskTemplate/:id', async (req: any, res: any, next) => {
    try {
        if (!req.session.userData) {
            throw new Error('Not authenticated');
        }
        const _editor = await PersonsController.getPersonFromSessionUserData(
            req.session.userData
        );
        let item = new TaskTemplate({ ...req.parsedBody, _editor });
        await item.editInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/taskTemplate/:id', async (req: any, res: any, next) => {
    try {
        let item = new TaskTemplate(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});
