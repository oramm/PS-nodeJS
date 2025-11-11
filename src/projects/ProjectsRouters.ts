import { Request, Response } from 'express';
import ProjectsController from './ProjectsController';
import { app } from '../index';
import Project from './Project';

app.post('/projects', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await ProjectsController.find(orConditions);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/project', async (req: Request, res: Response, next) => {
    try {
        const project = new Project(req.parsedBody);

        // ✅ Bezpośrednie wywołanie Controller - withAuth zarządza OAuth wewnętrznie
        const result = await ProjectsController.add(project);

        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.put('/project/:id', async (req: Request, res: Response, next) => {
    try {
        const project = new Project(req.parsedBody);

        // ✅ Bezpośrednie wywołanie Controller - withAuth zarządza OAuth wewnętrznie
        const result = await ProjectsController.edit(project);

        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.delete('/project/:id', async (req: Request, res: Response, next) => {
    try {
        const project = new Project(req.body);

        // ✅ Bezpośrednie wywołanie Controller - withAuth zarządza OAuth wewnętrznie
        await ProjectsController.delete(project);

        res.send(project);
    } catch (error) {
        next(error);
    }
});
