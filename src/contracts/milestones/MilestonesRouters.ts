import MilestonesController from './MilestonesController';
import { app } from '../../index';
import ToolsGapi from '../../setup/GAuth2/ToolsGapi';
import Milestone from './Milestone';
import { Request, Response } from 'express';

app.post('/milestones', async (req: Request, res: Response) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const parentType = req.parsedBody.parentType;
        const result = await MilestonesController.getMilestonesList(
            orConditions,
            parentType
        );
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/milestone', async (req: Request, res: Response) => {
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
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.put('/milestone/:id', async (req: Request, res: Response) => {
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
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.delete('/milestone/:id', async (req: Request, res: Response) => {
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
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});
