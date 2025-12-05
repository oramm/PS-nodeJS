import { Request, Response } from 'express';
import { app } from '../index';
import OurOffer from './OurOffer';
import { CityData, OfferData } from '../types/types';
import OffersController from './OffersController';
import ExternalOffer from './ExternalOffer';
import EnviErrors from '../tools/Errors';
import TaskStore from '../setup/Sessions/IntersessionsTasksStore';
import { SessionTask } from '../types/sessionTypes';
import OfferBondsController from './OfferBond/OfferBondsController';

app.post('/offers', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await OffersController.find(orConditions);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/offer', async (req: Request, res: Response, next) => {
    try {
        const taskId = crypto.randomUUID();
        TaskStore.create(taskId);

        const item = await makeOfferObject(req);
        TaskStore.update(taskId, 'Rejestracja oferty w toku', 5);
        res.status(202).send({
            progressMesage: 'Oferta w trakcie przetwarzania',
            status: 'processing',
            percent: 0,
            taskId,
        } as SessionTask);

        // ✅ Bezpośrednie wywołanie Controller - withAuth zarządza OAuth wewnętrznie
        setImmediate(async () => {
            try {
                await OffersController.add(item, req.session.userData!, taskId);
                TaskStore.complete(
                    taskId,
                    item,
                    'Oferta pomyślnie zarejestrowana'
                );
            } catch (err) {
                console.error('Błąd async:', err);
                TaskStore.fail(taskId, (err as Error).message);
            }
        });
    } catch (error) {
        next(error);
    }
});

app.put('/offer/:id', async (req: Request, res: Response, next) => {
    try {
        const item = await makeOfferObject(req);
        const taskId = crypto.randomUUID();
        TaskStore.create(taskId);

        res.status(202).send({
            progressMesage: 'Oferta w trakcie przetwarzania',
            status: 'processing',
            percent: 0,
            taskId,
        } as SessionTask);

        // ✅ Bezpośrednie wywołanie Controller - withAuth zarządza OAuth wewnętrznie
        setImmediate(async () => {
            try {
                await OffersController.edit(
                    item,
                    taskId,
                    req.parsedBody._fieldsToUpdate
                );
                TaskStore.complete(taskId, item, 'Oferta zmieniona pomyślnie');
            } catch (err) {
                console.error('Błąd async:', err);
                TaskStore.fail(taskId, (err as Error).message);
            }
        });
    } catch (error) {
        next(error);
    }
});

app.put('/sendOffer/:id', async (req: Request, res: Response, next) => {
    try {
        if (!req.parsedBody._newEvent)
            throw new Error('Brak danych nowego wydarzenia');
        const item = await makeOfferObject(req);
        if (!req.parsedBody._newEvent?._gdFilesBasicData?.length)
            throw new Error('Brak plików do wysłania');

        // ✅ Bezpośrednie wywołanie Controller - withAuth zarządza OAuth wewnętrznie
        if (item instanceof OurOffer) {
            await OffersController.sendOurOffer(
                item,
                req.session.userData!,
                req.parsedBody._newEvent
            );
        }
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/exportOurOfferToPDF', async (req: Request, res: Response, next) => {
    try {
        const item = await makeOfferObject(req);

        // ✅ Bezpośrednie wywołanie Controller - withAuth zarządza OAuth wewnętrznie
        if (item instanceof OurOffer) {
            await OffersController.exportOfferToPDF(item);
        }
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.post(
    '/getFilesDataFromGdFolder',
    async (req: Request, res: Response, next) => {
        try {
            const item = await makeOfferObject(req);

            // ✅ Bezpośrednie wywołanie Controller - withAuth zarządza OAuth wewnętrznie
            if (item instanceof OurOffer) {
                const result = await OffersController.getOfferFilesData(item);
                res.send(result);
            }
        } catch (error) {
            next(error);
        }
    }
);

app.put('/addNewOfferBond/:id', async (req: Request, res: Response, next) => {
    try {
        const item = (await makeOfferObject(req)) as ExternalOffer;

        // ✅ Bezpośrednie wywołanie Controller zamiast metody Model
        if (!item._offerBond) throw new Error('No OfferBond data');
        await OfferBondsController.addNew(item._offerBond, item);

        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/editOfferBond/:id', async (req: Request, res: Response, next) => {
    try {
        const item = (await makeOfferObject(req)) as ExternalOffer;

        // ✅ Bezpośrednie wywołanie Controller zamiast metody Model
        if (!item._offerBond) throw new Error('No OfferBond data');
        await OfferBondsController.edit(item._offerBond, item);

        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.put('/deleteOfferBond/:id', async (req: Request, res: Response, next) => {
    try {
        const item = (await makeOfferObject(req)) as ExternalOffer;

        // ✅ Bezpośrednie wywołanie Controller zamiast metody Model
        if (!item._offerBond) throw new Error('No OfferBond data');
        await OfferBondsController.delete(item._offerBond);
        item._offerBond = null;

        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/offer/:id', async (req: Request, res: Response, next) => {
    try {
        const item = await makeOfferObject(req);

        // ✅ Bezpośrednie wywołanie Controller - withAuth zarządza OAuth wewnętrznie
        await OffersController.delete(item, req.session.userData);

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

async function makeOfferObject(req: Request) {
    const isOur = req.parsedBody.isOur as boolean;
    const invitationMail = req.parsedBody._contextData?.mail;
    if (!req.parsedBody._city) throw new Error('Brak danych miasta w ofercie');

    // Przygotowanie danych miasta
    let _city: CityData;
    if (typeof req.parsedBody._city === 'string') {
        // Tworzenie nowego miasta z string
        _city = await OffersController.makeNewCityObject(req.parsedBody._city);
    } else {
        // Walidacja istniejących danych miasta
        const cityData = req.parsedBody._city as CityData;
        if (!cityData.id && (!cityData.name || cityData.name.trim() === '')) {
            throw new Error('Dane miasta są niepełne - brak id i nazwy');
        }
        _city = cityData;
    }
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
        ? new OurOffer({ ...offerInitParams, _invitationMail: invitationMail })
        : new ExternalOffer(offerInitParams);
    return item;
}
