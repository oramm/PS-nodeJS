import express, { Request, Response } from 'express';
import EntitiesController from './EntitiesController';
import { app } from '../index';
import { isValidNipChecksum, normalizeNip } from '../contracts/aqmSync/AqmSync';
import GusBirService, {
    GusBirNotConfiguredError,
    GusBirNotFoundError,
} from './gusBir/GusBirService';
import { GUS_ACCEPTABLE_FIELDS } from './gusBir/GusCompare';
import { runGusSweep } from './gusBir/GusSweep';
import { buildGusReport } from './gusBir/GusReport';
import adminPanelGuard from '../Admin/adminPanelGuard';

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

/**
 * GUS-3 — przebieg całego słownika partiami i zestawienie do sprzątania.
 *
 * KOLEJNOŚĆ REJESTRACJI. Obie trasy stoją PRZED trasami z `:id` celowo, choć zmierzone
 * zachowanie Expressa 4.21 mówi, że kolizji tu nie ma: `/entities/gus/sweep` ma trzy
 * segmenty, a `/entities/:id/gus/check` cztery, więc żaden wzorzec nie łapie cudzego
 * adresu (sprawdzone uruchomieniem, nie rozumowaniem — trafiał zawsze właściwy handler).
 * Kolejność jest tu zabezpieczeniem na przyszłość: gdyby ktoś dopisał `/entities/:id`
 * albo `/entities/:id/gus`, trasa nazwana wprost dalej wygra.
 *
 * DOSTĘP. Obie za bramką panelu administracyjnego — ten sam warunek roli co prefiks
 * `/admin` (ADMIN albo ENVI_MANAGER), tylko przypięty do trasy, bo adres nie zaczyna się
 * od `/admin`. Przebieg pyta zewnętrzny rejestr ~385 razy i zapisuje status całemu
 * słownikowi; to nie jest czynność dla dowolnego zalogowanego pracownika.
 *
 * Cron woła runGusSweepUntilDone WPROST (src/index.ts), z pominięciem tej trasy —
 * harmonogram nie ma sesji, więc nie miałby jak przejść przez bramkę.
 */
app.post(
    '/entities/gus/sweep',
    adminPanelGuard,
    async (req: Request, res: Response, next) => {
        try {
            const rawLimit = req.body?.limit;
            const limit =
                rawLimit === undefined || rawLimit === null
                    ? undefined
                    : Number(rawLimit);
            if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0))
                return res.status(400).json({
                    error: 'limit musi być dodatnią liczbą całkowitą',
                });

            const summary = await runGusSweep(limit);
            res.json(summary);
        } catch (error) {
            next(error);
        }
    }
);

app.get(
    '/entities/gus/report',
    adminPanelGuard,
    async (req: Request, res: Response, next) => {
        try {
            res.json(await buildGusReport());
        } catch (error) {
            next(error);
        }
    }
);

/**
 * GUS-2 — kody odpowiedzi dla odmowy sprawdzenia albo przyjęcia.
 * 404 nieznany podmiot, 400 nie ma o co zapytać albo nie ma czego przyjąć,
 * 503 brak klucza GUS (fail-closed, tak samo jak przy /entities/lookup-nip).
 */
const GUS_REFUSAL_HTTP_STATUS: Record<string, number> = {
    ENTITY_NOT_FOUND: 404,
    NO_USABLE_NIP: 400,
    GUS_NOT_CONFIGURED: 503,
    NO_SNAPSHOT: 400,
    NO_FIELDS: 400,
};

/** Numer podmiotu ze ścieżki; cokolwiek innego niż liczba dodatnia to 400. */
function parseEntityId(raw: unknown): number | undefined {
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : undefined;
}

// GUS-2: pyta rejestr GUS o ten jeden podmiot i zapisuje SAM werdykt.
// Nazwa i adres podmiotu nie są tu dotykane (D-GUS-1) — od tego jest /gus/accept niżej.
app.post('/entities/:id/gus/check', async (req: Request, res: Response, next) => {
    try {
        const id = parseEntityId(req.params.id);
        if (!id)
            return res
                .status(400)
                .json({ error: 'Nieprawidłowy numer podmiotu w adresie' });

        const result = await EntitiesController.gusCheck(id);
        if (!result.ok)
            return res
                .status(GUS_REFUSAL_HTTP_STATUS[result.reason] ?? 400)
                .json({ error: result.message, reason: result.reason });
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// GUS-2 / D-GUS-1: jedyna droga, którą dane z GUS wchodzą do podmiotu.
// Body: { fields: ['name', 'address', 'regon', 'krs'] } — przepisywane są tylko te wskazane.
app.post('/entities/:id/gus/accept', async (req: Request, res: Response, next) => {
    try {
        const id = parseEntityId(req.params.id);
        if (!id)
            return res
                .status(400)
                .json({ error: 'Nieprawidłowy numer podmiotu w adresie' });

        const requested = Array.isArray(req.body?.fields) ? req.body.fields : [];
        const fields = GUS_ACCEPTABLE_FIELDS.filter((field) =>
            requested.includes(field)
        );
        if (fields.length === 0)
            return res.status(400).json({
                error: 'Nie wskazano żadnego pola do przyjęcia (dozwolone: name, address, regon, krs)',
                reason: 'NO_FIELDS',
            });

        const result = await EntitiesController.gusAccept(id, fields);
        if (!result.ok)
            return res
                .status(GUS_REFUSAL_HTTP_STATUS[result.reason] ?? 400)
                .json({ error: result.message, reason: result.reason });
        res.json(result);
    } catch (error) {
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
