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

        // Migracja: Case.addNewController() → CasesController.add()
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            CasesController.add,
            [caseItem], // Argumenty w tablicy
            CasesController // Context dla this
        );

        res.send(caseItem);
    } catch (error) {
        next(error);
    }
});
app.put('/case/:id', async (req: Request, res: Response, next) => {
    try {
        const itemFromClient = req.parsedBody;
        let item = new Case(itemFromClient);
        if (item._wasChangedToUniquePerMilestone)
            item.setAsUniquePerMilestone();

        // Migracja: Case.editInDb() + editFolder() + editInScrum() → CasesController.edit()
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            CasesController.edit,
            [item], // Argumenty w tablicy
            CasesController // Context dla this
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

        // Migracja: Case.deleteFromDb() + deleteFolder() + deleteFromScrumSheet() → CasesController.delete()
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            CasesController.delete,
            [item], // Argumenty w tablicy
            CasesController // Context dla this
        );

        res.send(item);
    } catch (error) {
        next(error);
    }
});
