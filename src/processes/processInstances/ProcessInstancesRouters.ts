import ProcessInstancesController from './ProcessInstancesController'
import { app } from '../../index';

app.get('/processInstances', async (req: any, res: any) => {
    try {
        var result = await ProcessInstancesController.getProcessInstancesList(req.query);
        res.send(result);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }


});

app.get('/processInstance/:id', async (req: any, res: any) => {
    try {
        var result = await ProcessInstancesController.getProcessInstancesList(req.params);
        res.send(result);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }


});

module.exports = app;