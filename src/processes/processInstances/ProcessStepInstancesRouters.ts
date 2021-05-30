import ProcessStepInstancesController from './ProcessStepInstancesController'
import { app } from '../../index';

app.get('/processStepInstances', async (req: any, res: any) => {
    try {
        var result = await ProcessStepInstancesController.getProcessStepInstancesList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.get('/processStepInstance/:id', async (req: any, res: any) => {
    try {
        var result = await ProcessStepInstancesController.getProcessStepInstancesList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;