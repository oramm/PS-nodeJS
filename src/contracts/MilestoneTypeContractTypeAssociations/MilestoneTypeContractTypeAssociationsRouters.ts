import MilestoneTypeContractTypeAssociationsController from './MilestoneTypeContractTypeAssociationsController';
import { app } from '../../index';
import MilestoneTypeContractType from './MilestoneTypeContractType';
import PersonsController from '../../persons/PersonsController';

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
            if (!req.session.userData) {
                throw new Error('Not authenticated');
            }
            const _editor =
                await PersonsController.getPersonFromSessionUserData(
                    req.session.userData
                );
            let item = new MilestoneTypeContractType({
                ...req.parsedBody,
                _editor,
            });
            await item.addInDb();
            res.send(item);
        } catch (error) {
            next(error);
        }
    }
);

app.put(
    '/milestoneTypeContractTypeAssociation/:id',
    async (req: any, res: any, next) => {
        try {
            if (!req.session.userData) {
                throw new Error('Not authenticated');
            }
            const _editor =
                await PersonsController.getPersonFromSessionUserData(
                    req.session.userData
                );
            let item = new MilestoneTypeContractType({
                ...req.parsedBody,
                _editor,
            });
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
