import express, { Request, Response } from 'express'
import ProjectsController from './ProjectsController'
import { app } from '../index';
import ToolsGapi from '../setup/GAuth2/ToolsGapi';
import Project from './Project';
import { UserData } from '../setup/GAuth2/sessionTypes';



app.get('/projects/:systemEmail', async (req: Request, res: Response) => {
    console.log('get projects %o', req.session.userData);
    console.log('get projects session id ' + req.sessionID);
    try {
        const result = await ProjectsController.getProjectsList({
            ...req.params,
            ...req.query,
            userData: req.session.userData as UserData
        });
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.get('/project/:id/systemEmail/:systemEmail', async (req: Request, res: Response) => {
    try {
        console.log('params and userData: ', { ...req.params, ...req.session.userData });
        const result = (await ProjectsController.getProjectsList({
            ...req.params,
            userData: req.session.userData as UserData
        }))[0];
        await result?.setProjectEntityAssociationsFromDb();
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.post('/project', async (req: any, res: any) => {

    try {
        let item = new Project(req.body);
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

app.put('/project/:id', async (req: any, res: any) => {
    try {
        let item = new Project(req.body);
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

app.delete('/project/:id', async (req: any, res: any) => {
    try {
        let item = new Project(req.body);
        console.log('delete');
        await item.deleteFromDb();
        await Promise.all([
            ToolsGapi.gapiReguestHandler(req, res, item.deleteProjectFolder, undefined, item)
        ]);
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});