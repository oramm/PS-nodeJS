import { Request, Response } from 'express';
import { app } from '../../index';
import ContractsController from '../ContractsController';
import {
    getFidmanContractSyncStatus,
    getFidmanNipGapReport,
    retryOrPushFidmanContract,
} from './FidmanSync';

/**
 * SYNC-P2 — operational surface on top of the SYNC-P1 FIDman outbox.
 *
 * Route shape follows the per-entity sub-resource idiom used by the KSeF routes
 * (InvoicesRouters.ts: GET /invoice/:id/ksef/status, POST /invoice/:id/ksef/send)
 * and /contract/:id/move — i.e. /<resource>/:id/<subfeature>/<action>.
 *
 *   GET  /contract/:id/fidmanSync/status
 *     -> FidmanSyncStatus (see FidmanSync.ts) for the badge + skip-reason "awizo"
 *        on the contract list/card.
 *   POST /contract/:id/fidmanSync/retry
 *     -> manual "dopchnij synchronizację" (WYK-2 zadanie 4). Ponawia ostatni wiersz
 *        FAILED/SKIPPED, a gdy takiego nie ma — buduje ładunek od nowa z ŻYWEJ umowy
 *        i wysyła, bo to jest stan każdej nowej umowy po zaznaczeniu „Objęta
 *        synchronizacją" oraz każdej, której ostatnia wysyłka się udała.
 *        Umowa nieprzechodząca bramki -> 409 z powodem i BEZ wpisu w kolejce.
 *        404 zostaje wyłącznie dla „nie ma takiej umowy".
 *        Umowę składa TA TRASA (ContractsController.find), tak jak robi to
 *        src/scripts/fidman-backfill.ts — moduł syncu nie importuje kontrolera.
 *   GET  /fidmanSync/gaps
 *     -> SYNC-P3 "awizowanie braków": FidmanNipGapReport — entities missing a
 *        valid NIP that are parties of synced-type contracts, plus synced-type
 *        contracts missing StartDate/EndDate. Global (not per-contract), so it
 *        sits at the top level rather than under /contract/:id.
 */
app.get(
    '/contract/:id/fidmanSync/status',
    async (req: Request, res: Response, next) => {
        try {
            const contractId = parseInt(req.params.id, 10);
            if (!contractId)
                throw new Error('Brak wymaganego parametru: id kontraktu');
            const status = await getFidmanContractSyncStatus(contractId);
            res.send(status);
        } catch (error) {
            next(error);
        }
    }
);

app.post(
    '/contract/:id/fidmanSync/retry',
    async (req: Request, res: Response, next) => {
        try {
            const contractId = parseInt(req.params.id, 10);
            if (!contractId)
                throw new Error('Brak wymaganego parametru: id kontraktu');
            // Żywa umowa RAZEM ZE STRONAMI — `find({ id })` dokleja _employers/_engineers/
            // _contractors (ContractRepository.setContractPartsbySearchParams), więc ładunek
            // ma z czego powstać. Ta sama cegła, której używa skrypt masowego dopchnięcia.
            const [contract] = (await ContractsController.find([
                { id: contractId },
            ])) as any[];
            if (!contract) {
                res.status(404).send({
                    error: 'Nie znaleziono umowy o podanym identyfikatorze',
                });
                return;
            }

            const result = await retryOrPushFidmanContract(contract);
            if (!result.ok) {
                // 409 — żądanie zrozumiałe, ale stan umowy na wysyłkę nie pozwala.
                // Ciało `{ error }` jak dotąd, bo front wstawia je do alertu werbatim.
                res.status(409).send({ error: result.message });
                return;
            }
            res.send(result.status);
        } catch (error) {
            next(error);
        }
    }
);

app.get('/fidmanSync/gaps', async (req: Request, res: Response, next) => {
    try {
        const report = await getFidmanNipGapReport();
        res.send(report);
    } catch (error) {
        next(error);
    }
});
