import { Request, Response } from 'express';
import { app } from '../../index';
import MeetingArrangementsController from './MeetingArrangementsController';

app.post(
    '/meetingArrangements',
    async (req: Request, res: Response, next) => {
        try {
            const result =
                await MeetingArrangementsController.findFromDto(
                    req.parsedBody ?? req.body,
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
            const item = await MeetingArrangementsController.addFromDto(
                req.parsedBody ?? req.body,
            );
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
            const item = await MeetingArrangementsController.editFromDto({
                ...(req.parsedBody ?? req.body),
                id: parseInt(req.params.id, 10),
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
            const { status } = req.parsedBody ?? req.body;
            const item = await MeetingArrangementsController.updateStatus(
                parseInt(req.params.id, 10),
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
            await MeetingArrangementsController.deleteById(
                parseInt(req.params.id, 10),
            );
            res.send({ status: 'ok' });
        } catch (error) {
            next(error);
        }
    },
);
