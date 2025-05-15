import ProcessesController from './ProcesesController';
import { app } from '../index';
import Process from './Process';

app.get('/processes', async (req: any, res: any, next) => {
    try {
        const result = await ProcessesController.getProcessesList(req.query);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.get('/process/:id', async (req: any, res: any, next) => {
    try {
        const result = await ProcessesController.getProcessesList(req.params);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/process', async (req: any, res: any, next) => {
    try {
        let item = new Process(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.put('/process/:id', async (req: any, res: any, next) => {
    try {
        let item = new Process(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/process/:id', async (req: any, res: any, next) => {
    try {
        let item = new Process(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});
