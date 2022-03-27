import ProcessStepsController from './ProcessStepsController'
import { app } from '../index'
import ProcessStep from './ProcessStep';

app.get('/processSteps', async (req: any, res: any) => {
    try {
        var result = await ProcessStepsController.getProcessStepsList(req.query);
        res.send(result);
    } catch (err) {
        if (err instanceof Error)
            res.status(500).send(err.message);
        console.error(err);
    }


});

app.get('/processStep/:id', async (req: any, res: any) => {
    try {
        var result = await ProcessStepsController.getProcessStepsList(req.params);
        res.send(result);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }


});

app.post('/processStep', async (req: any, res: any) => {
    try {
        let item = new ProcessStep(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send(error.message);
        console.log(error);
    };
});

app.put('/processStep/:id', async (req: any, res: any) => {
    try {
        let item = new ProcessStep(req.body);

        console.log(item._documentTemplate)
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

app.delete('/processStep/:id', async (req: any, res: any) => {
    try {
        let item = new ProcessStep(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }
});