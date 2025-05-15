import ProcessInstancesController from './ProcessInstancesController';
import { app } from '../../index';

app.get('/processInstances', async (req: any, res: any, next) => {
    try {
        const result = await ProcessInstancesController.getProcessInstancesList(
            req.query
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.get('/processInstance/:id', async (req: any, res: any, next) => {
    try {
        const result = await ProcessInstancesController.getProcessInstancesList(
            req.params
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

module.exports = app;
