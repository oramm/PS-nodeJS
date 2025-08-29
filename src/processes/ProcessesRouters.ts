import ProcessesController from './ProcesesController';
import { app } from '../index';

app.get('/processes', async (req: any, res: any, next) => {
    try {
        const result = await ProcessesController.find(req.query);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.get('/process/:id', async (req: any, res: any, next) => {
    try {
        const result = await ProcessesController.find(req.params);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/process', async (req: any, res: any, next) => {
    try {
        if (!req.session?.userData) {
            throw new Error('Użytkownik niezalogowany');
        }
        const item = await ProcessesController.addNewProcess(req.body, req.session.userData);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/process/:id', async (req: any, res: any, next) => {
    try {
        if (!req.session?.userData) {
            throw new Error('Użytkownik niezalogowany');
        }
        const fieldsToUpdate = req.parsedBody?._fieldsToUpdate;
        const item = await ProcessesController.updateProcess(req.parsedBody || req.body, fieldsToUpdate, req.session.userData);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/process/:id', async (req: any, res: any, next) => {
    try {
        const result = await ProcessesController.deleteProcess(req.body);
        res.send(result);
    } catch (error) {
        next(error);
    }
});
