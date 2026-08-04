import { Request, Response } from 'express';
import { app } from '../index';
import MeetingsController from './MeetingsController';
import ProjectScopeGuard from '../persons/projectAssignments/ProjectScopeGuard';

app.post('/meetings', async (req: Request, res: Response, next) => {
    try {
        const result = await MeetingsController.findFromDto(
            req.parsedBody ?? req.body,
            req.projectScope,
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/meeting', async (req: Request, res: Response, next) => {
    try {
        const payload = req.parsedBody ?? req.body;
        await ProjectScopeGuard.assertContractInScope(
            Number(payload?.contractId ?? payload?._contract?.id),
            req.projectScope,
        );
        const item = await MeetingsController.addFromDto(payload);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/meeting/:id', async (req: Request, res: Response, next) => {
    try {
        await ProjectScopeGuard.assertMeetingInScope(
            Number(req.params.id),
            req.projectScope,
        );
        const item = await MeetingsController.editFromDto({
            ...req.parsedBody ?? req.body,
            id: parseInt(req.params.id, 10),
        });
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/meeting/:id', async (req: Request, res: Response, next) => {
    try {
        await ProjectScopeGuard.assertMeetingInScope(
            Number(req.params.id),
            req.projectScope,
        );
        await MeetingsController.deleteById(parseInt(req.params.id, 10));
        res.send({ status: 'ok' });
    } catch (error) {
        next(error);
    }
});
