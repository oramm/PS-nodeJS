import { NextFunction, Request, Response } from 'express';
import { app } from '../index';
import SbAccessController from './SbAccessController';
import SbAccessValidator from './SbAccessValidator';
import { SbAccessError } from './sbAccessPolicy';
import {
    SB_DEVICE_TOKEN_HEADER,
    parseCiphertext,
    parsePublicKeyJwk,
    parseSecretName,
} from './sbSecretsPolicy';
import { SbAccessOperationOutcome } from './sbAccessTypes';

/**
 * Trasy modułu dostępu do Second Brain (plan SB.RDZEN.01, B3).
 *
 * KOLEJNOŚĆ MA ZNACZENIE (jak w BankSyncRouter): najpierw trasy dla każdego zalogowanego
 * (pytanie o uprawnienie, przypisanie WŁASNEGO konta GitHub), potem bramka całego prefiksu,
 * potem trasy zarządzania. Trasa dopisana pod bramką jest domyślnie zamknięta; trasa dla
 * osoby zaproszonej (B4) musi stanąć NAD bramką i sama pilnować, że dotyczy tylko siebie.
 *
 * Odmowy i błędy biznesowe idą wprost (status + errorMessage), nie przez globalny handler,
 * który zrobiłby z nich 500 z mailem-raportem.
 */

function handleError(error: unknown, res: Response, next: NextFunction): void {
    if (error instanceof SbAccessError) {
        res.status(error.status).send({ errorMessage: error.message });
        return;
    }
    next(error);
}

/**
 * OK i PARTIAL = 200 z polem `result` (klient MUSI pokazać PARTIAL i uwagę);
 * FAILED = 502, bo nic się nie zmieniło, a klient ma to potraktować jak błąd.
 */
function sendOutcome(res: Response, outcome: SbAccessOperationOutcome): void {
    if (outcome.result === 'FAILED') {
        res.status(502).send({ errorMessage: outcome.note, ...outcome });
        return;
    }
    res.send(outcome);
}

function requesterId(req: Request): number {
    return req.session.userData!.enviId;
}

// ------------------------------------------------ dla każdego zalogowanego

/** Uprawnienia zalogowanego i jego widok SB; niedostępny wpis pozostaje ukryty. */
app.get('/sbAccess/access', async (req, res, next) => {
    try {
        res.send(await SbAccessController.getOwnAccess(req.session?.userData));
    } catch (error) {
        next(error);
    }
});

/**
 * Osoba zaproszona przypisuje SOBIE konto GitHub ("to moje konto", B4). Osoba zawsze
 * z sesji, nigdy z żądania; kontroler pilnuje, że wpis jest zaproszony albo aktywny.
 */
app.post('/sbAccess/me/githubAccount', async (req, res, next) => {
    try {
        const login = SbAccessValidator.requireGithubLogin(req.parsedBody);
        const personId = requesterId(req);
        sendOutcome(
            res,
            await SbAccessController.linkGithub(personId, login, personId, 'self'),
        );
    } catch (error) {
        handleError(error, res, next);
    }
});

/**
 * Hasła szyfrowane (SBD-2), trasy "moje": osoba z sesji ALBO z tokenu urządzenia w nagłówku
 * x-envi-sb-device-token (instalator SB nie ma przeglądarki). Obie trasy są na liście
 * requireSession jako sprawdzające poświadczenie same (src/setup/Sessions/requireSession.ts).
 * Osoby nigdy nie bierze się z treści żądania, więc nie da się ustawić klucza ani pobrać
 * szyfrogramów za kogoś innego.
 */
const self = (req: Request) =>
    SbAccessController.resolveSelf(req.session?.userData, req.headers?.[SB_DEVICE_TOKEN_HEADER]);

/** Klucz publiczny komputera: { publicKeyJwk: { kty: "RSA", n, e: "AQAB" } }. */
app.put('/sbAccess/me/publicKey', async (req, res, next) => {
    try {
        const record = await self(req);
        const jwk = parsePublicKeyJwk(req.parsedBody?.publicKeyJwk);
        res.send(await SbAccessController.setOwnPublicKey(record, jwk));
    } catch (error) {
        handleError(error, res, next);
    }
});

/** Własne szyfrogramy (nazwa + base64) i odcisk klucza, którym je zaszyfrowano. */
app.get('/sbAccess/me/secrets', async (req, res, next) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        res.send(await SbAccessController.listOwnSecrets(await self(req)));
    } catch (error) {
        handleError(error, res, next);
    }
});

// ------------------------------------------------ bramka zarządzania

async function sbAccessManagementGuard(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        if (!req.session?.userData) {
            res.status(401).send({ errorMessage: 'Użytkownik niezalogowany' });
            return;
        }
        if (!(await SbAccessController.canManage(req.session.userData))) {
            res.status(403).send({
                errorMessage: 'Brak uprawnień do zarządzania dostępem do Second Brain',
            });
            return;
        }
        next();
    } catch (error) {
        next(error);
    }
}

app.use('/sbAccess', sbAccessManagementGuard);

// ------------------------------------------------ zarządzanie (za bramką)

/** Rejestr: kto ma jaki dostęp. Sam odczyt bazy, bez wywołań GitHuba. */
app.get('/sbAccess/entries', async (_req, res, next) => {
    try {
        res.send(await SbAccessController.list());
    } catch (error) {
        next(error);
    }
});

/** Kogo można zaprosić (role wg D2, bez wpisu albo z dostępem odebranym). */
app.get('/sbAccess/candidates', async (_req, res, next) => {
    try {
        res.send(await SbAccessController.listInviteCandidates());
    } catch (error) {
        next(error);
    }
});

/** Członkowie organizacji GitHub bez przypisanej osoby. */
app.get('/sbAccess/githubMembers/unlinked', async (_req, res, next) => {
    try {
        res.send(await SbAccessController.listUnlinkedGithubMembers());
    } catch (error) {
        handleError(error, res, next);
    }
});

app.get('/sbAccess/:personId/events', async (req, res, next) => {
    try {
        const personId = SbAccessValidator.requirePersonId(req.params.personId);
        const limit = SbAccessValidator.optionalLimit(req.query.limit);
        res.send(await SbAccessController.history(personId, limit));
    } catch (error) {
        handleError(error, res, next);
    }
});

const OPERATIONS = {
    invite: (personId: number, by: number) => SbAccessController.invite(personId, by),
    block: (personId: number, by: number) => SbAccessController.block(personId, by),
    unblock: (personId: number, by: number) => SbAccessController.unblock(personId, by),
    revoke: (personId: number, by: number) => SbAccessController.revoke(personId, by),
} as const;

for (const [name, operation] of Object.entries(OPERATIONS)) {
    app.post(`/sbAccess/:personId/${name}`, async (req, res, next) => {
        try {
            const personId = SbAccessValidator.requirePersonId(req.params.personId);
            sendOutcome(res, await operation(personId, requesterId(req)));
        } catch (error) {
            handleError(error, res, next);
        }
    });
}

/** Kierownik przypisuje konto GitHub komuś (także z listy członków bez przypisania). */
app.put('/sbAccess/:personId/githubAccount', async (req, res, next) => {
    try {
        const personId = SbAccessValidator.requirePersonId(req.params.personId);
        const login = SbAccessValidator.requireGithubLogin(req.parsedBody);
        sendOutcome(
            res,
            await SbAccessController.linkGithub(personId, login, requesterId(req), 'manager'),
        );
    } catch (error) {
        handleError(error, res, next);
    }
});

/** Admin zmienia poziomy dostępu (repozytoria, poczta, baza PS, Dysk) wybranej osoby. */
app.put('/sbAccess/:personId/levels', async (req, res, next) => {
    try {
        const personId = SbAccessValidator.requirePersonId(req.params.personId);
        const levels = SbAccessValidator.parseLevels(req.parsedBody);
        res.send(await SbAccessController.setLevels(personId, levels, requesterId(req)));
    } catch (error) {
        handleError(error, res, next);
    }
});

/**
 * Admin udostępnia hasło: przeglądarka wysyła wyłącznie szyfrogram (RSA-OAEP-SHA256, base64,
 * 256 bajtów) i odcisk klucza, którym szyfrowała. Jawne hasło nigdy nie dociera do serwera.
 */
app.put('/sbAccess/:personId/secrets/:name', async (req, res, next) => {
    try {
        const personId = SbAccessValidator.requirePersonId(req.params.personId);
        const name = parseSecretName(req.params.name);
        const ciphertext = parseCiphertext(req.parsedBody?.ciphertext);
        const thumbprint = req.parsedBody?.keyThumbprint;
        if (typeof thumbprint !== 'string' || !/^[0-9a-f]{64}$/.test(thumbprint))
            throw new SbAccessError(400, 'Brak odcisku klucza, którym zaszyfrowano hasło.');
        res.send(
            await SbAccessController.giveSecret(personId, name, ciphertext, thumbprint, requesterId(req)),
        );
    } catch (error) {
        handleError(error, res, next);
    }
});

/** Admin odbiera hasło (usunięcie szyfrogramu + zdarzenie z przypomnieniem o zmianie hasła u źródła). */
app.delete('/sbAccess/:personId/secrets/:name', async (req, res, next) => {
    try {
        const personId = SbAccessValidator.requirePersonId(req.params.personId);
        const name = parseSecretName(req.params.name);
        res.send(await SbAccessController.takeSecret(personId, name, requesterId(req)));
    } catch (error) {
        handleError(error, res, next);
    }
});
