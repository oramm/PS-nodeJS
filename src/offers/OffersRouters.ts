import { Request, Response } from 'express';
import { app } from '../index';
import ToolsGapi, { oAuthClient } from '../setup/GAuth2/ToolsGapi';
import OurOffer from './OurOffer';
import { CityData, EntityData, OfferData } from '../types/types';
import OffersController from './OffersController';
import ExternalOffer from './ExternalOffer';
import EnviErrors from '../tools/Errors';
import ToolsGd from '../tools/ToolsGd';
import Setup from '../setup/Setup';
import OfferEvent from './offerEvent/OfferEvent';

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
            [req.session.userData],
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
            [req.parsedBody._fieldsToUpdate],
            item
        );
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.put('/sendOffer/:id', async (req: Request, res: Response) => {
    try {
        if (!req.parsedBody._newEvent)
            throw new Error('Brak danych nowego wydarzenia');
        const item = makeOfferObject(req);
        if (!req.parsedBody._newEvent?._gdFilesBasicData?.length)
            throw new Error('Brak plików do wysłania');
        if (item instanceof OurOffer)
            await ToolsGapi.gapiReguestHandler(
                req,
                res,
                item.sendOfferController,
                [req.session.userData, req.parsedBody._newEvent],
                item
            );
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.post('/getFilesDataFromGdFolder', async (req: Request, res: Response) => {
    try {
        const item = makeOfferObject(req);
        if (item instanceof OurOffer) {
            const result = await ToolsGapi.gapiReguestHandler(
                req,
                res,
                item.getOfferFilesData,
                undefined,
                item
            );
            res.send(result);
        }
    } catch (error) {
        console.error(error);
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
    }
});

app.put('/addNewOfferBond/:id', async (req: Request, res: Response) => {
    try {
        const item = makeOfferObject(req) as ExternalOffer;
        await item.addNewOfferBondController();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.put('/editOfferBond/:id', async (req: Request, res: Response) => {
    try {
        const item = makeOfferObject(req) as ExternalOffer;
        await item.editOfferBondController();
        res.send(item);
    } catch (error) {
        if (error instanceof Error)
            res.status(500).send({ errorMessage: error.message });
        console.error(error);
    }
});

app.put('/deleteOfferBond/:id', async (req: Request, res: Response) => {
    try {
        const item = makeOfferObject(req) as ExternalOffer;
        await item.deleteOfferBondController();
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
        if (
            error instanceof EnviErrors.NoGdIdError ||
            error instanceof EnviErrors.DbError
        ) {
            res.status(500).send({
                errorMessage: error.message,
                errorCode: error.code,
            });
        } else if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        } else {
            res.status(500).send({ errorMessage: 'Nieznany błąd' });
        }
    }
});

function makeOfferObject(req: Request) {
    const isOur = req.parsedBody.isOur as boolean;
    const _city: CityData =
        typeof req.parsedBody._city === 'string'
            ? { name: req.parsedBody._city }
            : req.parsedBody._city;
    let employerName: string | undefined = req.parsedBody.employerName;
    if (typeof req.parsedBody._employer === 'string')
        employerName = req.parsedBody._employer;
    const lastEventGdFilesJSON = JSON.stringify(
        req.parsedBody._lastEvent?._gdFilesBasicData
    );
    const lastEventRecipientsJSON = JSON.stringify(
        req.parsedBody._lastEvent?._recipients
    );
    const offerInitParams: OfferData = {
        ...req.parsedBody,
        _city,
        employerName,
        _editor: req.parsedBody._editor || {
            id: req.session.userData?.enviId as number,
        },
        _lastEvent: {
            ...req.parsedBody._lastEvent,
            gdFilesJSON: lastEventGdFilesJSON,
            recipientsJSON: lastEventRecipientsJSON,
        },
    };
    const item = isOur
        ? new OurOffer(offerInitParams)
        : new ExternalOffer(offerInitParams);
    return item;
}
