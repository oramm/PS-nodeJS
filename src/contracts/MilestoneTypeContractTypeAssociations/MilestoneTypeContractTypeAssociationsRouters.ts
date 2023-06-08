import MilestoneTypeContractTypeAssociationsController from './MilestoneTypeContractTypeAssociationsController'
import { app } from '../../index';
import MilestoneTypeContractType from './MilestoneTypeContractType';

app.get('/milestoneTypeContractTypeAssociations', async (req: any, res: any) => {
    try {
        const result = await MilestoneTypeContractTypeAssociationsController.getMilestoneTypeContractTypeAssociationsList(req.query);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.get('/milestoneTypeContractTypeAssociation/:id', async (req: any, res: any) => {
    try {
        const result = await MilestoneTypeContractTypeAssociationsController.getMilestoneTypeContractTypeAssociationsList(req.params);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/milestoneTypeContractTypeAssociation', async (req: any, res: any) => {
    try {
        let item = new MilestoneTypeContractType(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    };
});

app.put('/milestoneTypeContractTypeAssociation/:id', async (req: any, res: any) => {
    try {
        let item = new MilestoneTypeContractType(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.delete('/milestoneTypeContractTypeAssociation/:id', async (req: any, res: any) => {
    try {
        let item = new MilestoneTypeContractType(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});