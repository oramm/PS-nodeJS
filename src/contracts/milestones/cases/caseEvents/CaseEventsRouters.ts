import { app } from '../../../../index';
import CaseEventsController from './CaseEventsController';

app.get('/caseEvents', async (req: any, res: any, next) => {
    try {
        const result = await CaseEventsController.find(req.query);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.get('/caseEvent/:id', async (req: any, res: any, next) => {
    try {
        const result = await CaseEventsController.find(req.params);
        res.send(result);
    } catch (error) {
        next(error);
    }
});
