import { Request, Response } from 'express';
import OfferBondsController from './OfferBondsController';
import OfferBond from './OfferBond';
import { app } from '../../index';

// GET Offer Bonds
app.post('/offerBonds', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await OfferBondsController.getOfferBondsList(
            orConditions
        );
        res.send(result);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

// POST a new Offer Bond
app.post('/offerBond', async (req: Request, res: Response, next) => {
    try {
        const offerBond = new OfferBond(req.body);
        await OfferBondsController.addNew(offerBond);
        res.send(offerBond);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});

// DELETE an existing Offer Bond
app.delete('/offerBond/:id', async (req: Request, res: Response, next) => {
    try {
        let offerBond = new OfferBond(req.body);
        await OfferBondsController.delete(offerBond);
        res.send(offerBond);
    } catch (error) {
        console.error(error);
        if (error instanceof Error) {
            res.status(500).send({ errorMessage: error.message });
        }
    }
});
