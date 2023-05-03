import ProcessStepInstancesController from './ProcessStepInstancesController'
import { app } from '../../index';

app.get('/processStepInstances', async (req: any, res: any) => {
    try {
        const result = await ProcessStepInstancesController.getProcessStepInstancesList(req.query);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }


});

app.get('/processStepInstance/:id', async (req: any, res: any) => {
    try {
        const result = await ProcessStepInstancesController.getProcessStepInstancesList(req.params);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }


});

module.exports = app;