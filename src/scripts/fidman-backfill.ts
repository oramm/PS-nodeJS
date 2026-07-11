/**
 * SYNC-B1 — CLI runner for the FIDman contract backfill.
 *
 * Usage:
 *   ts-node src/scripts/fidman-backfill.ts            # dry-run (default), writes nothing
 *   ts-node src/scripts/fidman-backfill.ts --apply    # enqueue qualifying contracts
 *
 * Modeled 1:1 on aqm-backfill.ts. Scope: PS Contracts whose TypeId is in the
 * FIDMAN_SYNC_CONTRACT_TYPE_IDS allowlist (default 3,4 — Żółty/Czerwony) AND
 * Status <> 'Archiwalny'. Reuses buildContractPayload / enqueueFidmanContractPush
 * from ../contracts/fidmanSync/FidmanSync.ts (no reimplementation of payload logic).
 *
 * Gaps counted (contract still enumerated, just skipped/flagged):
 *  - NEEDS_DATA: contract missing startDate OR endDate -> contract skipped entirely.
 *  - NO_NIP: a contract party (Entity) without a valid NIP -> party skipped,
 *    contract still counts as qualifying (and, in apply mode, is still enqueued;
 *    FIDman itself applies the same NEEDS_DATA/NO_NIP skip logic on ingest).
 *    Reported as DISTINCT entities (an entity can be a party on >1 contract in
 *    scope; the 2026-07-11 audit's "party-entities" figure counts distinct
 *    Entity ids, not per-contract-role rows — see dispatcher report for the
 *    raw per-role row count too).
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import Setup from '../setup/Setup';
import ToolsDb from '../tools/ToolsDb';
import ContractsController from '../contracts/ContractsController';
import {
    buildContractPayload,
    enqueueFidmanContractPush,
} from '../contracts/fidmanSync/FidmanSync';
import { isValidNipChecksum } from '../contracts/aqmSync/AqmSync';

function hasFlag(name: string): boolean {
    return process.argv.slice(2).includes(`--${name}`);
}

function collectEntities(contract: any): any[] {
    return [
        ...(contract._employers ?? []),
        ...(contract._engineers ?? []),
        ...(contract._contractors ?? []),
    ];
}

async function main() {
    const apply = hasFlag('apply');
    const typeIds = Setup.FidmanSync.contractTypeIds;

    const orConditions = typeIds.map((typeId) => ({ typeId }));
    const allContracts = await ContractsController.find(orConditions);
    const contracts = (allContracts as any[]).filter(
        (c) => c.status !== 'Archiwalny'
    );

    const needsDataIds: number[] = [];
    const noNipContractIds = new Set<number>();
    const partyEntityIds = new Set<number>();
    const noNipEntityIds = new Set<number>();
    let qualify = 0;

    const alreadyEnqueuedIds = apply
        ? new Set(
              (
                  (await ToolsDb.getQueryCallbackAsync(
                      `SELECT DISTINCT RefId
                       FROM FidmanSyncOutbox
                       WHERE Kind = 'contract.upsert' AND Status IN ('PENDING', 'SENT')`,
                      undefined,
                      []
                  )) as Array<{ RefId: number }>
              ).map((r) => r.RefId)
          )
        : new Set<number>();

    let enqueued = 0;
    let alreadyEnqueued = 0;

    for (const contract of contracts) {
        if (!contract.startDate || !contract.endDate) {
            needsDataIds.push(contract.id);
            continue;
        }

        const entities = collectEntities(contract);
        let contractHasNoNip = false;
        for (const e of entities) {
            if (e?.id != null) partyEntityIds.add(e.id);
            if (!isValidNipChecksum(e?.taxNumber)) {
                contractHasNoNip = true;
                if (e?.id != null) noNipEntityIds.add(e.id);
            }
        }
        if (contractHasNoNip) noNipContractIds.add(contract.id);

        qualify += 1;

        if (!apply) continue;

        if (alreadyEnqueuedIds.has(contract.id)) {
            alreadyEnqueued += 1;
            continue;
        }
        await ToolsDb.transaction(async (conn) => {
            await enqueueFidmanContractPush(contract, conn);
        });
        alreadyEnqueuedIds.add(contract.id);
        enqueued += 1;
    }

    console.log(`[FidmanBackfill] mode=${apply ? 'apply' : 'dry-run'}`);
    console.log(`[FidmanBackfill] type ids in scope: ${typeIds.join(',')}`);
    console.log(`[FidmanBackfill] total in scope (non-Archiwalny): ${contracts.length}`);
    console.log(`[FidmanBackfill] qualify (would enter): ${qualify}`);
    console.log(
        `[FidmanBackfill]   - NEEDS_DATA: ${needsDataIds.length} ids=[${needsDataIds.join(', ')}]`
    );
    console.log(
        `[FidmanBackfill]   - party-entities (distinct, qualifying contracts): ${partyEntityIds.size}`
    );
    console.log(
        `[FidmanBackfill]   - NO_NIP: ${noNipEntityIds.size} distinct entities, across contracts=[${[
            ...noNipContractIds,
        ].join(', ')}]`
    );
    if (apply) {
        console.log(`[FidmanBackfill] newly enqueued: ${enqueued}`);
        console.log(`[FidmanBackfill] already enqueued/synced (deduped): ${alreadyEnqueued}`);
    } else {
        console.log('[FidmanBackfill] dry-run — nothing written.');
    }

    // Reuse buildContractPayload just to prove the exact payload shape a real
    // apply run would enqueue for the first qualifying contract (dry-run only,
    // never sent/written).
    const sample = contracts.find(
        (c) => c.startDate && c.endDate && !needsDataIds.includes(c.id)
    );
    if (sample) {
        console.log(
            `[FidmanBackfill] sample payload (contract ${sample.id}):`,
            JSON.stringify(buildContractPayload(sample))
        );
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[FidmanBackfill] error:', err);
        process.exit(1);
    });
