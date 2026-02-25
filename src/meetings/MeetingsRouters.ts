import { Request, Response } from 'express';
import { app } from '../index';
import MeetingsController from './MeetingsController';

app.post('/meetings', async (req: Request, res: Response, next) => {
    try {
        const result = await MeetingsController.findFromDto(
            req.parsedBody ?? req.body,
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/meeting', async (req: Request, res: Response, next) => {
    try {
        const item = await MeetingsController.addFromDto(
            req.parsedBody ?? req.body,
        );
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/meeting/:id', async (req: Request, res: Response, next) => {
    try {
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
        await MeetingsController.deleteById(parseInt(req.params.id, 10));
        res.send({ status: 'ok' });
    } catch (error) {
        next(error);
    }
});
