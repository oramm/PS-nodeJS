import { Request, Response } from 'express';
import { app } from '../../index';
import { runContractDocumentsCheck } from './ContractDocumentsCheck';

/**
 * Powierzchnia operacyjna kontroli „czy wgrano umowę na Dysk".
 *
 *   POST /contracts/documentsCheck   body: { limit?: number }
 *     -> ContractDocumentsCheckSummary (zob. ContractDocumentsCheck.ts)
 *
 * DLACZEGO ENDPOINT, A NIE CRON. Aplikacja stoi na Heroku, gdzie dyno usypia i budzi się dopiero
 * na żądanie. `node-cron` w procesie nie odpala się wtedy wcale — pominięte wywołania nie są
 * odrabiane, tylko przepadają (oba istniejące zadania cron w index.ts mają zresztą ENABLED=false).
 * Wyzwalaczem jest więc coś z zewnątrz: cykliczny skill wołający ten endpoint. Samo wywołanie budzi
 * dyno przy okazji.
 *
 * DLACZEGO PARTIAMI. Heroku ucina żądanie po 30 sekundach, a pełny przebieg po ~620 umowach jest
 * zbyt blisko tej granicy. Odpowiedź niesie `remaining`, więc wywołujący pętli, aż spadnie do zera.
 * Kolejka to „umowy niesprawdzone dzisiaj", czyli pętla zbiega bez przekazywania stanu między
 * żądaniami.
 *
 * DOSTĘP. Wystarcza globalne `agentTokenAuth` (app.use w index.ts): endpoint działa dla nagłówka
 * x-envi-agent-token i dla zalogowanego pracownika ENVI. To drugie jest celowe — daje ręczne
 * uruchomienie przy diagnozie, bez czekania na harmonogram.
 */
app.post('/contracts/documentsCheck', async (req: Request, res: Response, next) => {
    try {
        const rawLimit = req.parsedBody?.limit;
        const limit =
            rawLimit === undefined || rawLimit === null
                ? undefined
                : Number(rawLimit);

        if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0))
            return res
                .status(400)
                .send({ error: 'limit musi być dodatnią liczbą całkowitą' });

        const summary = await runContractDocumentsCheck(limit);
        res.send(summary);
    } catch (error) {
        next(error);
    }
});
