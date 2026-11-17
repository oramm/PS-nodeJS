import RouteIdValidator from '../../../tools/RouteIdValidator';
import CaseValidator from './CaseValidator';
import CasesController from './CasesController';
import { app } from '../../../index';
import { Request, Response } from 'express';
import ProjectScopeGuard from '../../../persons/projectAssignments/ProjectScopeGuard';

app.post('/cases', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await CasesController.find(
            orConditions,
            req.projectScope
        );
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
        // Nowa sprawa nie ma jeszcze id - sprawdzamy kamień milowy, pod który trafia.
        await ProjectScopeGuard.assertMilestoneInScope(
            Number(req.parsedBody._parent?.id ?? req.parsedBody.milestoneId),
            req.projectScope
        );
        if (req.parsedBody.parentCaseId) await ProjectScopeGuard.assertCaseInScope(
            Number(req.parsedBody.parentCaseId), req.projectScope);
        const result = await CasesController.addFromDto(req.parsedBody);

        res.send(result.caseItem);
    } catch (error) {
        next(error);
    }
});

app.put('/case/:id', async (req: Request, res: Response, next) => {
    try {
        // Id z URL-a, nie z ciała żądania: ciało kontroluje wywołujący.
        await ProjectScopeGuard.assertCaseInScope(
            RouteIdValidator.positiveId(req.params.id),
            req.projectScope
        );
        const selected = CaseValidator.selectedParents(req.parsedBody, req.parsedBody._fieldsToUpdate);
        if (selected.milestoneId !== undefined) await ProjectScopeGuard.assertMilestoneInScope(
            Number(selected.milestoneId), req.projectScope);
        if (selected.parentCaseId !== undefined) await ProjectScopeGuard.assertCaseInScope(
            Number(selected.parentCaseId), req.projectScope);
        const result = await CasesController.editFromDto(
            {...req.parsedBody, id: RouteIdValidator.positiveId(req.params.id)}, undefined, req.parsedBody._fieldsToUpdate
        );

        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.delete('/case/:id', async (req: Request, res: Response, next) => {
    try {
        await ProjectScopeGuard.assertCaseInScope(
            RouteIdValidator.positiveId(req.params.id),
            req.projectScope
        );
        const item = {...req.body, id: RouteIdValidator.positiveId(req.params.id)};
        await CasesController.deleteFromDto(item);
        res.send(item);
    } catch (error) {
        next(error);
    }
});
