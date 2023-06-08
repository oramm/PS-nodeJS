import ProcessInstancesController from './ProcessInstancesController'
import { app } from '../../index';

app.get('/processInstances', async (req: any, res: any) => {
    try {
        const result = await ProcessInstancesController.getProcessInstancesList(req.query);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }


});

app.get('/processInstance/:id', async (req: any, res: any) => {
    try {
        const result = await ProcessInstancesController.getProcessInstancesList(req.params);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }


});

module.exports = app;