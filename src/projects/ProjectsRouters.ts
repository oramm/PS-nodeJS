import express from 'express'
import ProjectsController from './ProjectsController'
import { app } from '../index';
import ToolsGapi from '../setup/GAuth2/ToolsGapi';
import Project from './Project';



app.get('/projects/:systemEmail', async (req: any, res: any) => {
    try {
        var result = await ProjectsController.getProjectsList(req.params);
        res.send(result);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }


});

app.get('/project/:id/systemEmail/:systemEmail', async (req: any, res: any) => {
    try {
        console.log(req.params);
        const result = (await ProjectsController.getProjectsList(req.params))[0];
        await result?.setProjectEntityAssociationsFromDb();
        res.send(result);
    } catch (error) {
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
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
            res.status(500).send(error.message);
        console.log(error);
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
            res.status(500).send(error.message);
        console.log(error);
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
        console.log(error);
        if (error instanceof Error)
            res.status(500).send(error.message);
        throw error;
    }
});