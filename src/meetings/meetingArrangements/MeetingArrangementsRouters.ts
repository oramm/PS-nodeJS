import RouteIdValidator from '../../tools/RouteIdValidator';
import MeetingArrangementValidator from './MeetingArrangementValidator';
import { Request, Response } from 'express';
import { app } from '../../index';
import MeetingArrangementsController from './MeetingArrangementsController';
import ProjectScopeGuard from '../../persons/projectAssignments/ProjectScopeGuard';

app.post(
    '/meetingArrangements',
    async (req: Request, res: Response, next) => {
        try {
            const result =
                await MeetingArrangementsController.findFromDto(
                    req.parsedBody ?? req.body,
                    req.projectScope,
                );
            res.send(result);
        } catch (error) {
            next(error);
        }
    },
);

app.post(
    '/meetingArrangement',
    async (req: Request, res: Response, next) => {
        try {
            const payload = req.parsedBody ?? req.body;
            await ProjectScopeGuard.assertCaseInScope(
                Number(MeetingArrangementValidator.selectedParents(payload).caseId),
                req.projectScope,
            );
            await ProjectScopeGuard.assertMeetingInScope(Number(payload.meetingId), req.projectScope);
            const item = await MeetingArrangementsController.addFromDto(payload);
            res.send(item);
        } catch (error) {
            next(error);
        }
    },
);

app.put(
    '/meetingArrangement/:id',
    async (req: Request, res: Response, next) => {
        try {
            await ProjectScopeGuard.assertMeetingArrangementInScope(
                RouteIdValidator.positiveId(req.params.id),
                req.projectScope,
            );
            const selected = MeetingArrangementValidator.selectedParents(req.parsedBody ?? req.body);
            if (selected.caseId) await ProjectScopeGuard.assertCaseInScope(Number(selected.caseId), req.projectScope);
            if (selected.meetingId) await ProjectScopeGuard.assertMeetingInScope(Number(selected.meetingId), req.projectScope);
            const item = await MeetingArrangementsController.editFromDto({
                ...(req.parsedBody ?? req.body),
                id: RouteIdValidator.positiveId(req.params.id),
            });
            res.send(item);
        } catch (error) {
            next(error);
        }
    },
);

app.put(
    '/meetingArrangement/:id/status',
    async (req: Request, res: Response, next) => {
        try {
            await ProjectScopeGuard.assertMeetingArrangementInScope(
                RouteIdValidator.positiveId(req.params.id),
                req.projectScope,
            );
            const { status } = req.parsedBody ?? req.body;
            const item = await MeetingArrangementsController.updateStatus(
                RouteIdValidator.positiveId(req.params.id),
                status,
            );
            res.send(item);
        } catch (error) {
            next(error);
        }
    },
);

app.delete(
    '/meetingArrangement/:id',
    async (req: Request, res: Response, next) => {
        try {
            await ProjectScopeGuard.assertMeetingArrangementInScope(
                RouteIdValidator.positiveId(req.params.id),
                req.projectScope,
            );
            await MeetingArrangementsController.deleteById(
                RouteIdValidator.positiveId(req.params.id),
            );
            res.send({ status: 'ok' });
        } catch (error) {
            next(error);
        }
    },
);
