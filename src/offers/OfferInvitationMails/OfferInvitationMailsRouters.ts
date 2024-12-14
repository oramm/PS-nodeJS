import { Request, Response } from 'express';
import { app } from '../../index';
import ToolsMail from '../../tools/ToolsMail';
import OfferInvitationMail from './OfferInvitationMail';
import OfferInvitationMailsController from './OfferInvitationMailsController';

app.post('/mailsToCheck', async (req: Request, res: Response) => {
    try {
        if (!req.parsedBody.orConditions[0])
            throw new Error('Brak warunków wyszukiwania');
        const result = await ToolsMail.fuzzySearchEmails(
            req.parsedBody.orConditions[0]
        );
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/mailToCheck', async (req: Request, res: Response) => {
    try {
        const item = new OfferInvitationMail(req.parsedBody);
        await item.addNewController(req.session.userData!);
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.post('/getEmailDetails', async (req: Request, res: Response) => {
    try {
        const uid = req.parsedBody.id;
        const item = await ToolsMail.getEmailDetails(uid);
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.delete('/mailToCheck/:id', async (req: Request, res: Response) => {
    try {
        const item = new OfferInvitationMail(req.parsedBody);
        await ToolsMail.deleteMail(item.uid.toString());
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.post('/mailInvitations', async (req: Request, res: Response) => {
    try {
        if (!req.parsedBody.orConditions[0])
            throw new Error('Brak warunków wyszukiwania');
        const result =
            await OfferInvitationMailsController.getOfferInvitationMailsList(
                req.parsedBody.orConditions
            );
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.put('/mailInvitation/:id', async (req: Request, res: Response) => {
    try {
        const item = new OfferInvitationMail(req.parsedBody);
        await item.editController(req.session.userData!);
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.delete('/mailInvitation/:id', async (req: Request, res: Response) => {
    try {
        const item = new OfferInvitationMail(req.parsedBody);
        await item.deleteFromDb();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});
