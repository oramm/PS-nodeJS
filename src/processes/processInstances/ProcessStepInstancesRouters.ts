import ProcessStepInstancesController from './ProcessStepInstancesController';
import { app } from '../../index';

app.get('/processStepInstances', async (req: any, res: any, next) => {
    try {
        const result =
            await ProcessStepInstancesController.getProcessStepInstancesList(
                req.query
            );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.get('/processStepInstance/:id', async (req: any, res: any, next) => {
    try {
        const result =
            await ProcessStepInstancesController.getProcessStepInstancesList(
                req.params
            );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

module.exports = app;
