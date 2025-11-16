import MilestonesController from './MilestonesController';
import { MilestoneParentType } from './MilestoneRepository';
import { app } from '../../index';
import Milestone from './Milestone';
import { Request, Response } from 'express';
import MilestoneDatesController from './cases/milestoneDate/MilestoneDatesController';
import MilestoneDate from './cases/milestoneDate/MilestoneDate';
import { MilestoneDateData } from '../../types/types';
import ContractOur from '../ContractOur';
import ContractOther from '../ContractOther';
import ContractsController from '../ContractsController';

app.post('/milestones', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const parentType = req.parsedBody.parentType as MilestoneParentType;
        const result = await MilestonesController.find(
            orConditions,
            parentType
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/milestoneDates', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const parentType = req.parsedBody.parentType as MilestoneParentType;
        const result = await MilestoneDatesController.getMilestoneDatesList(
            orConditions,
            parentType
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/milestone', async (req: Request, res: Response, next) => {
    try {
        const milestone = new Milestone(req.parsedBody);

        // ✅ Bezpośrednie wywołanie Controller - withAuth zarządza OAuth wewnętrznie
        const result = await MilestonesController.add(
            milestone,
            undefined,
            req.session.userData
        );

        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.put('/milestone/:id', async (req: Request, res: Response, next) => {
    try {
        const milestone = new Milestone(req.parsedBody);
        milestone._contract = await milestone.getParentContractFromDb();

        // ✅ Bezpośrednie wywołanie Controller - withAuth zarządza OAuth wewnętrznie
        const result = await MilestonesController.edit(
            milestone,
            undefined,
            req.session.userData,
            req.parsedBody._fieldsToUpdate
        );

        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.put(
    '/milestoneDateMilestone/:id',
    async (req: Request, res: Response, next) => {
        try {
            const item = req.parsedBody as MilestoneDateData;
            const milestone = new Milestone(req.parsedBody._milestone);
            milestone._contract = await milestone.getParentContractFromDb();

            // ✅ Bezpośrednie wywołanie Controller - withAuth zarządza OAuth wewnętrznie
            await MilestonesController.edit(
                milestone,
                undefined,
                req.session.userData,
                req.parsedBody._fieldsToUpdate
            );

            res.send({ ...item, _milestone: milestone });
        } catch (error) {
            if (error instanceof Error)
                res.status(500).send({ errorMessage: error.message });
            console.error(error);
        }
    }
);

app.put(
    '/milestoneDateContract/:id',
    async (req: Request, res: Response, next) => {
        try {
            const item = req.parsedBody as MilestoneDateData;
            const _contract = (req.parsedBody as MilestoneDateData)._milestone
                ?._contract;
            if (!_contract?.id) throw new Error('Brak danych kontraktu');

            //Jeśli tworzysz instancje klasy na podstawie obiektu, musisz przekazać 'itemFromClient'
            const contractInstance = _contract._type.isOur
                ? new ContractOur(_contract)
                : new ContractOther(_contract);

            const updatedContract = await ContractsController.editWithAuth(
                contractInstance,
                req.parsedBody._fieldsToUpdate
            );
            item._milestone!._contract = updatedContract;
            res.send(item);
        } catch (error) {
            next(error);
        }
    }
);

app.put('/milestoneDate/:id', async (req: Request, res: Response, next) => {
    try {
        const item = new MilestoneDate(req.parsedBody);
        if (!req.session.userData) {
            throw new Error('User data not available in session');
        }

        await item.editController(
            req.session.userData,
            req.parsedBody._fieldsToUpdate
        );
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/milestone/:id', async (req: Request, res: Response, next) => {
    try {
        const milestone = new Milestone(req.body);

        // ✅ Bezpośrednie wywołanie Controller - withAuth zarządza OAuth wewnętrznie
        await MilestonesController.delete(milestone);

        res.send(milestone);
    } catch (error) {
        next(error);
    }
});

app.delete('/milestoneDate/:id', async (req: Request, res: Response, next) => {
    try {
        const item = new MilestoneDate(req.parsedBody);
        if (!req.session.userData) {
            throw new Error('User data not available in session');
        }
        await item.deleteController(req.session.userData);

        res.send(item);
    } catch (error) {
        next(error);
    }
});
