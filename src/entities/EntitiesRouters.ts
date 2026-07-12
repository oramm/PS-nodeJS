import express, { Request, Response } from 'express';
import EntitiesController from './EntitiesController';
import { app } from '../index';
import { isValidNipChecksum, normalizeNip } from '../contracts/aqmSync/AqmSync';
import GusBirService, {
    GusBirNotConfiguredError,
    GusBirNotFoundError,
} from './gusBir/GusBirService';

app.post('/entities', async (req: Request, res: Response, next) => {
    try {
        const orConditions = req.parsedBody.orConditions;
        const result = await EntitiesController.find(orConditions);
        res.send(result);
    } catch (error) {
        next(error);
    }
});

app.post('/entity', async (req: Request, res: Response, next) => {
    try {
        const item = await EntitiesController.add(req.body);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

// NIP-G1: "Pobierz z GUS" — server-side GUS BIR lookup by NIP. Address is
// concatenated server-side (frozen: no structural address columns); REGON/KRS
// travel in the response but the front ignores them (no new PS columns).
// Fail-closed: bad checksum -> 400, GUS_BIR_KEY not configured -> 503.
// BLOCKED until gate G-N1 (owner's real GUS key) — GUS_BIR_KEY unset in prod
// today, so this endpoint is dormant (503) until the owner sets it.
app.post('/entities/lookup-nip', async (req: Request, res: Response, next) => {
    try {
        const nip = normalizeNip(req.body?.nip);
        if (!isValidNipChecksum(nip)) {
            return res.status(400).json({ error: 'Nieprawidłowy NIP (błędna suma kontrolna)' });
        }
        if (!GusBirService.isConfigured()) {
            return res
                .status(503)
                .json({ error: 'Wyszukiwanie GUS nie jest skonfigurowane (brak GUS_BIR_KEY)' });
        }
        const entity = await GusBirService.lookupByNip(nip);
        res.json(entity);
    } catch (error) {
        if (error instanceof GusBirNotConfiguredError) {
            return res.status(503).json({ error: error.message });
        }
        if (error instanceof GusBirNotFoundError) {
            return res.status(404).json({ error: error.message });
        }
        next(error);
    }
});

app.put('/entity/:id', async (req: Request, res: Response, next) => {
    try {
        const item = await EntitiesController.edit(req.body);
        res.send(item);
    } catch (error) {
        next(error);
    }
});

app.delete('/entity/:id', async (req: Request, res: Response, next) => {
    try {
        if (!req.parsedBody || !req.parsedBody.id)
            throw new Error(`Próba usunięcia bez Id`);
        await EntitiesController.delete(req.parsedBody);
        res.json({ id: req.parsedBody.id, name: req.parsedBody.name });
    } catch (error) {
        next(error);
    }
});
