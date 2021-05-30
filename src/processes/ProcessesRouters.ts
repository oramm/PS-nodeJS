import ProcessesController from './ProcesesController'
import { app } from '../index'
import Process from './Process';

app.get('/processes', async (req: any, res: any) => {
    try {
        var result = await ProcessesController.getProcessesList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.get('/process/:id', async (req: any, res: any) => {
    try {
        var result = await ProcessesController.getProcessesList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.post('/process', async (req: any, res: any) => {
    try {
        let item = new Process(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        res.status(500).send(error.message);
        console.log(error);
    };
});

app.put('/process/:id', async (req: any, res: any) => {
    try {
        let item = new Process(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.delete('/process/:id', async (req: any, res: any) => {
    try {
        let item = new Process(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (err) {
        res.status(500).send(err.message);
    }
});