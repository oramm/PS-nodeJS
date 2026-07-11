import { Request, Response } from 'express';
import { app } from '../../index';
import {
    getFidmanContractSyncStatus,
    getFidmanNipGapReport,
    retryFidmanContractSync,
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
 *     -> manual "dopchnij synchronizację": re-delivers the latest FAILED/SKIPPED
 *        row via deliverOutboxRow (P1 code, not reimplemented). 404 when there is
 *        no FAILED/SKIPPED row to retry.
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
            const result = await retryFidmanContractSync(contractId);
            if (!result.ok) {
                res.status(404).send({
                    error: 'Brak wpisu FAILED/SKIPPED do ponowienia dla tego kontraktu',
                });
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
