import ContractTypesController from './ContractTypesController';
import { app } from '../../index';
import ContractType from './ContractType';

app.post('/contractTypes', async (req: any, res: any, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await ContractTypesController.getContractTypesList(
            orConditions
        );
        res.send(result);
    } catch (err) {
        console.error(err);
        if (err instanceof Error) res.status(500).send(err.message);
    }
});

app.post('/contractType', async (req: any, res: any, next) => {
    try {
        let item = new ContractType(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/contractType/:id', async (req: any, res: any, next) => {
    try {
        let item = new ContractType(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/contractType/:id', async (req: any, res: any, next) => {
    try {
        let item = new ContractType(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        next(error);
    }
});
