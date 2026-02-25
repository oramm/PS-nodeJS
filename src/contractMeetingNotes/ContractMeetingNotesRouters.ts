import { Request, Response } from 'express';
import { app } from '../index';
import ContractMeetingNotesController from './ContractMeetingNotesController';

app.post('/contractMeetingNotes', async (req: Request, res: Response, next) => {
    try {
        const result = await ContractMeetingNotesController.findFromDto(
            req.parsedBody ?? req.body,
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/contractMeetingNote', async (req: Request, res: Response, next) => {
    try {
        const fallbackCreatedByPersonId = req.session.userData?.enviId;
        const item = await ContractMeetingNotesController.addFromDto(
            req.parsedBody ?? req.body,
            fallbackCreatedByPersonId,
        );

        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/contractMeetingNote/:id', async (req: Request, res: Response, next) => {
    try {
        const item = await ContractMeetingNotesController.editFromDto({
            ...(req.parsedBody ?? req.body),
            id: parseInt(req.params.id, 10),
        });
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/contractMeetingNote/:id', async (req: Request, res: Response, next) => {
    try {
        await ContractMeetingNotesController.deleteById(
            parseInt(req.params.id, 10),
        );
        res.send({ status: 'ok' });
    } catch (error) {
        next(error);
    }
});
