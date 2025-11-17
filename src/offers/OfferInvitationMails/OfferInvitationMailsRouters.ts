import { Request, Response } from 'express';
import { app } from '../../index';
import ToolsMail from '../../tools/ToolsMail';
import OfferInvitationMail from './OfferInvitationMail';
import OfferInvitationMailsController from './OfferInvitationMailsController';

app.post('/mailsToCheck', async (req: Request, res: Response, next) => {
    try {
        if (!req.parsedBody.orConditions[0])
            throw new Error('Brak warunków wyszukiwania');
        const result = await ToolsMail.fuzzySearchEmails(
            req.parsedBody.orConditions[0]
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/mailToCheck', async (req: Request, res: Response, next) => {
    try {
        const item = new OfferInvitationMail(req.parsedBody);
        await OfferInvitationMailsController.add(item, req.session.userData!);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.post('/getEmailDetails', async (req: Request, res: Response, next) => {
    try {
        const uid = req.parsedBody.id;
        const item = await ToolsMail.getEmailDetails(uid);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/mailToCheck/:id', async (req: Request, res: Response, next) => {
    try {
        const item = new OfferInvitationMail(req.parsedBody);
        await ToolsMail.deleteMail(item.uid.toString());
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.post('/mailInvitations', async (req: Request, res: Response, next) => {
    try {
        if (!req.parsedBody.orConditions[0])
            throw new Error('Brak warunków wyszukiwania');
        const result = await OfferInvitationMailsController.find(
            req.parsedBody.orConditions
        );
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.put('/mailInvitation/:id', async (req: Request, res: Response, next) => {
    try {
        const item = new OfferInvitationMail(req.parsedBody);
        await OfferInvitationMailsController.edit(item, req.session.userData!);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/mailInvitation/:id', async (req: Request, res: Response, next) => {
    try {
        const item = new OfferInvitationMail(req.parsedBody);
        await OfferInvitationMailsController.delete(item);
        res.send(item);
    } catch (error) {
        next(error);
    }
});
