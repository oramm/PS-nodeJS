import ProcessStepsController from './ProcessStepsController';
import { app } from '../index';

app.get('/processSteps', async (req: any, res: any, next) => {
    try {
        const result = await ProcessStepsController.find(
            req.query
        );
        res.send(result);
    } catch (err) {
        if (err instanceof Error) res.status(500).send(err.message);
        console.error(err);
    }
});

app.get('/processStep/:id', async (req: any, res: any, next) => {
    try {
        const result = await ProcessStepsController.find(
            req.params
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/processStep', async (req: any, res: any, next) => {
    try {
        if (!req.session?.userData) {
            throw new Error('Użytkownik niezalogowany');
        }
        const item = await ProcessStepsController.addNewProcessStep(req.body, req.session.userData);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/processStep/:id', async (req: any, res: any, next) => {
    try {
        if (!req.session?.userData) {
            throw new Error('Użytkownik niezalogowany');
        }
        const fieldsToUpdate = req.parsedBody?._fieldsToUpdate;
        const item = await ProcessStepsController.updateProcessStep(req.parsedBody || req.body, fieldsToUpdate, req.session.userData); 
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/processStep/:id', async (req: any, res: any, next) => {
    try {
        const result = await ProcessStepsController.deleteProcessStep(req.body);
        res.send(result);
    } catch (error) {
        next(error);
    }
});
