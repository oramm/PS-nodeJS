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
