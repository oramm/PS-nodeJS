/**
 * WS10 / N5 — CLI runner for the AQM contract backfill.
 *
 * Usage:
 *   ts-node src/scripts/aqm-backfill.ts            # dry-run (default), writes nothing
 *   ts-node src/scripts/aqm-backfill.ts --apply    # enqueue qualifying contracts
 *
 * Wires real DB ports to the DB-free engine in ./contracts/aqmSync/backfill.ts.
 * Idempotent in apply mode (existing-outbox dedup guard). Live execution is
 * PARKED for the env-with-DB session — do not run against a live DB here.
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import mysql from 'mysql2/promise';
import Setup from '../setup/Setup';
import ToolsDb from '../tools/ToolsDb';
import ContractsController from '../contracts/ContractsController';
import { runBackfill, BackfillPorts } from '../contracts/aqmSync/backfill';

function hasFlag(name: string): boolean {
    return process.argv.slice(2).includes(`--${name}`);
}

async function main() {
    const apply = hasFlag('apply');
    const typeIds = Setup.AqmSync.contractTypeIds;

    const ports: BackfillPorts = {
        loadAqmContracts: async () => {
            // One OR-condition per allowlisted type id; find() returns full
            // contracts (incl. _employers).
            const orConditions = typeIds.map((typeId) => ({ typeId }));
            const contracts = await ContractsController.find(orConditions);
            return contracts as any[];
        },
        loadEnqueuedContractIds: async () => {
            const rows = (await ToolsDb.getQueryCallbackAsync(
                `SELECT DISTINCT ContractId
                 FROM AqmSyncOutbox
                 WHERE Status IN ('PENDING', 'SENT')`,
                undefined,
                []
            )) as Array<{ ContractId: number }>;
            return new Set((rows ?? []).map((r) => r.ContractId));
        },
        withTransaction: <T,>(
            fn: (conn: mysql.PoolConnection) => Promise<T>
        ) => ToolsDb.transaction<T>(fn),
    };

    const report = await runBackfill(ports, { apply });

    console.log(`[AqmBackfill] mode=${report.mode}`);
    console.log(`[AqmBackfill] total AQM-type contracts: ${report.total}`);
    console.log(`[AqmBackfill] qualify (1 employer, valid NIP): ${report.qualify}`);
    console.log(`[AqmBackfill] skipped: ${report.skipped}`);
    console.log(
        `[AqmBackfill]   - NO_EMPLOYER:        ${report.skippedByReason.NO_EMPLOYER}`
    );
    console.log(
        `[AqmBackfill]   - MULTIPLE_EMPLOYERS: ${report.skippedByReason.MULTIPLE_EMPLOYERS}`
    );
    console.log(
        `[AqmBackfill]   - BAD_NIP:            ${report.skippedByReason.BAD_NIP}`
    );
    if (apply) {
        console.log(`[AqmBackfill] newly enqueued: ${report.enqueued}`);
        console.log(
            `[AqmBackfill] already enqueued/synced (deduped): ${report.alreadyEnqueued}`
        );
    } else {
        console.log(`[AqmBackfill] would push: ${report.qualify}`);
        console.log('[AqmBackfill] dry-run — nothing written.');
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[AqmBackfill] error:', err);
        process.exit(1);
    });
