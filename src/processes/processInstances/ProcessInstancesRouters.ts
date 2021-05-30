import ProcessInstancesController from './ProcessInstancesController'
import { app } from '../../index';

app.get('/processInstances', async (req: any, res: any) => {
    try {
        var result = await ProcessInstancesController.getProcessInstancesList(req.query);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

app.get('/processInstance/:id', async (req: any, res: any) => {
    try {
        var result = await ProcessInstancesController.getProcessInstancesList(req.params);
        res.send(result);
    } catch (err) {
        res.status(500).send(err.message);
    }


});

module.exports = app;