import MilestoneTypeContractTypeAssociationsController from './MilestoneTypeContractTypeAssociationsController';
import { app } from '../../index';
import MilestoneTypeContractType from './MilestoneTypeContractType';

app.get(
    '/milestoneTypeContractTypeAssociations',
    async (req: any, res: any, next) => {
        try {
            const result =
                await MilestoneTypeContractTypeAssociationsController.getMilestoneTypeContractTypeAssociationsList(
                    req.query
                );
            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);

app.get(
    '/milestoneTypeContractTypeAssociation/:id',
    async (req: any, res: any, next) => {
        try {
            const result =
                await MilestoneTypeContractTypeAssociationsController.getMilestoneTypeContractTypeAssociationsList(
                    req.params
                );
            res.send(result);
        } catch (error) {
            next(error);
        }
    }
);

app.post(
    '/milestoneTypeContractTypeAssociation',
    async (req: any, res: any, next) => {
        try {
            let item = new MilestoneTypeContractType(req.body);
            await item.setEditorId();
            await item.addInDb();
            res.send(item);
        } catch (error) {
            if (error instanceof Error)
                res.status(500).send({ errorMessage: error.message });
            console.error(error);
        }
    }
);

app.put(
    '/milestoneTypeContractTypeAssociation/:id',
    async (req: any, res: any, next) => {
        try {
            let item = new MilestoneTypeContractType(req.body);
            await item.setEditorId();
            await item.editInDb();
            res.send(item);
        } catch (error) {
            next(error);
        }
    }
);

app.delete(
    '/milestoneTypeContractTypeAssociation/:id',
    async (req: any, res: any, next) => {
        try {
            let item = new MilestoneTypeContractType(req.body);
            await item.deleteFromDb();
            res.send(item);
        } catch (error) {
            next(error);
        }
    }
);
