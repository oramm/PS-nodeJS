import { Request, Response } from 'express'
import ProjectsController from './ProjectsController'
import { app } from '../index';
import ToolsGapi from '../setup/GAuth2/ToolsGapi';
import Project from './Project';
import { UserData } from '../setup/GAuth2/sessionTypes';

app.get('/projects', async (req: Request, res: Response) => {
    try {
        const result = await ProjectsController.getProjectsList([{
            ...req.parsedQuery,
            userData: req.session.userData as UserData
        }]);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/projects', async (req: Request, res: Response) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await ProjectsController.getProjectsList(orConditions);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/project', async (req: Request, res: Response) => {

    try {
        let item = new Project(req.parsedBody);
        //numer sprawy jest inicjowany dopiero po dodaniu do bazy - trigger w Db Projects
        await ToolsGapi.gapiReguestHandler(req, res, item.createProjectFolder, undefined, item);
        try {
            await item.setProjectEntityAssociationsFromDb();
            await item.addInDb();
        } catch (err) {
            ToolsGapi.gapiReguestHandler(req, res, item.deleteProjectFolder, undefined, item);
            throw err;
        }
        res.send(item);
    } catch (error) {

        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    };
});

app.put('/project/:id', async (req: Request, res: Response) => {
    try {
        const fieldsToUpdate = req.parsedBody.fieldsToUpdate;
        const itemFromClient = req.parsedBody;
        let item = new Project(itemFromClient);
        await Promise.all([
            ToolsGapi.gapiReguestHandler(req, res, item.editProjectFolder, undefined, item),
            item.editInDb(),
        ]);

        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.delete('/project/:id', async (req: Request, res: Response) => {
    try {
        let item = new Project(req.body);
        await item.deleteFromDb();
        await Promise.all([
            ToolsGapi.gapiReguestHandler(req, res, item.deleteProjectFolder, undefined, item)
        ]);
        console.log(`Project: ${item.ourId} ${item.alias} deleted`);
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});