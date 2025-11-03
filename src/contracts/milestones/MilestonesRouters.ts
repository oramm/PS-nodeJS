import MilestonesController, {
    MilestoneParentType,
} from './MilestonesController';
import { app } from '../../index';
import ToolsGapi from '../../setup/Sessions/ToolsGapi';
import Milestone from './Milestone';
import { Request, Response } from 'express';
import MilestoneDatesController from './cases/milestoneDate/MilestoneDatesController';
import MilestoneDate from './cases/milestoneDate/MilestoneDate';
import { MilestoneDateData } from '../../types/types';
import ContractOur from '../ContractOur';
import ContractOther from '../ContractOther';

app.post('/milestones', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const parentType = req.parsedBody.parentType as MilestoneParentType;
        const result = await MilestonesController.getMilestonesList(
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
        let item = new Milestone(req.parsedBody);
        //numer sprawy jest inicjowany dopiero po dodaniu do bazy - trigger w Db Milestones
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            item.addNewController,
            [req.session.userData],
            item
        );
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/milestone/:id', async (req: Request, res: Response, next) => {
    try {
        const item = new Milestone(req.parsedBody);
        item._contract = await item.getParentContractFromDb();
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            item.editController,
            [req.session.userData, req.parsedBody._fieldsToUpdate],
            item
        );
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put(
    '/milestoneDateMilestone/:id',
    async (req: Request, res: Response, next) => {
        try {
            const item = req.parsedBody as MilestoneDateData;
            const _milestone = new Milestone(req.parsedBody._milestone);
            _milestone._contract = await _milestone.getParentContractFromDb();

            await ToolsGapi.gapiReguestHandler(
                req,
                res,
                _milestone.editController,
                [req.session.userData, req.parsedBody._fieldsToUpdate],
                _milestone
            );
            res.send({ ...item, _milestone });
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
            await Promise.all([
                ToolsGapi.gapiReguestHandler(
                    req,
                    res,
                    contractInstance.editHandler,
                    [req.parsedBody._fieldsToUpdate],
                    contractInstance
                ),
            ]);
            item._milestone!._contract = contractInstance;
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
        let item = new Milestone(req.body);
        console.log('delete');
        await item.deleteFromDb();
        await Promise.all([
            ToolsGapi.gapiReguestHandler(
                req,
                res,
                item.deleteFolder,
                undefined,
                item
            ),
            ToolsGapi.gapiReguestHandler(
                req,
                res,
                item.deleteFromScrum,
                undefined,
                item
            ),
        ]);
        res.send(item);
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
