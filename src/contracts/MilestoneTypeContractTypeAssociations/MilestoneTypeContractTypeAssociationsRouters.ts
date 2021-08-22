import MilestoneTypeContractTypeAssociationsController from './MilestoneTypeContractTypeAssociationsController'
import { app } from '../../index';
import MilestoneTypeContractType from './MilestoneTypeContractType';

app.get('/milestoneTypeContractTypeAssociations', async (req: any, res: any) => {
    try {
        var result = await MilestoneTypeContractTypeAssociationsController.getMilestoneTypeContractTypeAssociationsList(req.query);
        res.send(result);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }
});

app.get('/milestoneTypeContractTypeAssociation/:id', async (req: any, res: any) => {
    try {
        var result = await MilestoneTypeContractTypeAssociationsController.getMilestoneTypeContractTypeAssociationsList(req.params);
        res.send(result);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }
});

app.post('/milestoneTypeContractTypeAssociation', async (req: any, res: any) => {
    try {
        let item = new MilestoneTypeContractType(req.body);
        await item.setEditorId();
        await item.addInDb();
        res.send(item);
    } catch (error) {
        res.status(500).send(error.message);
        console.log(error);
    };
});

app.put('/milestoneTypeContractTypeAssociation/:id', async (req: any, res: any) => {
    try {
        let item = new MilestoneTypeContractType(req.body);
        await item.setEditorId();
        await item.editInDb();
        res.send(item);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }
});

app.delete('/milestoneTypeContractTypeAssociation/:id', async (req: any, res: any) => {
    try {
        let item = new MilestoneTypeContractType(req.body);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        console.log(error);
        res.status(500).send(error.message);
        throw error;
    }
});