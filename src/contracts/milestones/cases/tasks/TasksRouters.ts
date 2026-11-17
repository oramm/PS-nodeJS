import TasksController from './TasksController';
import TaskValidator from './TaskValidator';
import { app } from '../../../../index';
import { Request, Response } from 'express';
import ProjectScopeGuard from '../../../../persons/projectAssignments/ProjectScopeGuard';

app.post('/tasks', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await TasksController.find(
            orConditions,
            req.projectScope
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/task', async (req: Request, res: Response, next) => {
    try {
        // Nowe zadanie: sprawdzamy sprawę, pod którą trafia.
        await ProjectScopeGuard.assertCaseInScope(
            Number(req.body._case?.id),
            req.projectScope
        );
        const item = await TasksController.add(req.body);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/task/:id', async (req: Request, res: Response, next) => {
    try {
        await ProjectScopeGuard.assertTaskInScope(
            Number(req.params.id),
            req.projectScope
        );
        const fieldsToUpdate = req.parsedBody._fieldsToUpdate;
        const target = TaskValidator.selectedCaseId(req.parsedBody, fieldsToUpdate);
        if (target !== undefined) await ProjectScopeGuard.assertCaseInScope(Number(target), req.projectScope);
        const item = await TasksController.edit({ ...req.parsedBody, id: Number(req.params.id) }, fieldsToUpdate);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/task/:id', async (req: Request, res: Response, next) => {
    try {
        await ProjectScopeGuard.assertTaskInScope(
            Number(req.params.id),
            req.projectScope
        );
        const result = await TasksController.delete({ ...req.body, id: Number(req.params.id) });
        res.send(result);
    } catch (error) {
        next(error);
    }
});
