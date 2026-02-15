import { Request, Response } from 'express';
import { app } from '../index';
import ContractMeetingNotesController from './ContractMeetingNotesController';
import ContractMeetingNoteValidator from './ContractMeetingNoteValidator';

app.post('/contractMeetingNote', async (req: Request, res: Response, next) => {
    try {
        const payload = ContractMeetingNoteValidator.validateCreatePayload(
            req.parsedBody ?? req.body
        );
        const fallbackCreatedByPersonId = req.session.userData?.enviId;
        const item = await ContractMeetingNotesController.addFromDto(
            payload,
            fallbackCreatedByPersonId
        );

        res.send(item);
    } catch (error) {
        next(error);
    }
});
