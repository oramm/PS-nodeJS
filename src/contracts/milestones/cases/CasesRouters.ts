import CasesController from './CasesController';
import { app } from '../../../index';
import Case from './Case';
import ToolsGapi from '../../../setup/Sessions/ToolsGapi';
import { Request, Response } from 'express';

app.post('/cases', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await CasesController.getCasesList(orConditions);
        res.send(result);
    } catch (err) {
        if (err instanceof Error) {
            res.status(500).send(err.message);
            console.error(err);
        }
    }
});

app.post('/case', async (req: Request, res: Response, next) => {
    try {
        const caseItem = new Case({
            ...req.parsedBody,
        });
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            caseItem.addNewController,
            undefined,
            caseItem
        );

        res.send(caseItem);
    } catch (error) {
        next(error);
    }
});

app.put('/case/:id', async (req: Request, res: Response, next) => {
    try {
        const _fieldsToUpdate = req.parsedBody._fieldsToUpdate;
        const itemFromClient = req.parsedBody;
        let item = new Case(itemFromClient);
        if (item._wasChangedToUniquePerMilestone)
            item.setAsUniquePerMilestone();
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            item.editFolder,
            undefined,
            item
        );
        await item.editInDb();
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            item.editInScrum,
            undefined,
            item
        );

        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/case/:id', async (req: Request, res: Response, next) => {
    try {
        let item = new Case(req.body);
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
                item.deleteFromScrumSheet,
                undefined,
                item
            ),
        ]);
        res.send(item);
    } catch (error) {
        next(error);
    }
});
