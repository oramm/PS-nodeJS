import { Request, Response } from 'express';
import { app } from '../index';
import ToolsGapi from '../setup/GAuth2/ToolsGapi';
import OurOffer from './OurOffer';
import { OfferData } from '../types/types';
import OffersController from './OffersController';
import ExternalOffer from './ExternalOffer';

app.post('/offers', async (req: Request, res: Response) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await OffersController.getOffersList(orConditions);
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.post('/offer', async (req: Request, res: Response) => {
    try {
        const item = makeOfferObject(req);
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            item.addNewController,
            undefined,
            item
        );
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.put('/offer/:id', async (req: Request, res: Response) => {
    try {
        const item = makeOfferObject(req);
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            item.editController,
            undefined,
            item
        );
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.delete('/offer/:id', async (req: Request, res: Response) => {
    try {
        const item = makeOfferObject(req);
        await ToolsGapi.gapiReguestHandler(
            req,
            res,
            item.deleteController,
            undefined,
            item
        );
        res.send(item);
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

function makeOfferObject(req: Request) {
    const isOur = req.parsedBody.isOur as boolean;
    const offerInitParams: OfferData = {
        ...req.parsedBody,
        _editor: req.parsedBody._editor || {
            id: req.session.userData?.enviId as number,
        },
    };
    const item = isOur
        ? new OurOffer(offerInitParams)
        : new ExternalOffer(offerInitParams);
    return item;
}