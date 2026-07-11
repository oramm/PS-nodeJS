import { Request, Response } from 'express';
import { app } from '../../index';
import {
    getFidmanContractSyncStatus,
    retryFidmanContractSync,
} from './FidmanSync';

/**
 * SYNC-P2 — operational surface on top of the SYNC-P1 FIDman outbox.
 *
 *   GET  /fidmanSync/contract/:id/status
 *     -> FidmanSyncStatus (see FidmanSync.ts) for the badge + skip-reason "awizo"
 *        on the contract list/card.
 *   POST /fidmanSync/contract/:id/retry
 *     -> manual "dopchnij synchronizację": re-delivers the latest FAILED/SKIPPED
 *        row via deliverOutboxRow (P1 code, not reimplemented). 404 when there is
 *        no FAILED/SKIPPED row to retry.
 */
app.get(
    '/fidmanSync/contract/:id/status',
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
    '/fidmanSync/contract/:id/retry',
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
