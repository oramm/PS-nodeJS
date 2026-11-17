import { Request, Response } from 'express';
import ProjectsController from './ProjectsController';
import { app } from '../index';
import Project from './Project';
import MailboxController from '../mailboxes/MailboxController';

app.post('/projects', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await ProjectsController.find(
            orConditions,
            req.projectScope
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/project', async (req: Request, res: Response, next) => {
    try {
        const selection = MailboxController.parseSelection(req.parsedBody._mailboxSelection, true);
        await MailboxController.validateProjectSelection(selection, req.parsedBody.ourId);
        const result = await ProjectsController.addFromDto(req.parsedBody);
        const mailbox = await MailboxController.afterProject(result.id!, result.ourId, selection, req.session?.userData?.enviId ?? null);
        res.send(Object.assign(result, mailbox));
    } catch (error) {
        next(error);
    }
});

app.put('/project/:id', async (req: Request, res: Response, next) => {
    try {
        const result = await ProjectsController.editFromDto(req.parsedBody);

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
