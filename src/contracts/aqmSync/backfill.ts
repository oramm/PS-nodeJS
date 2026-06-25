/**
 * WS10 / N5 — Backfill of existing "AQM"-type contracts into the AQM push
 * outbox (decisions/2026-06-25-ws10-ps-envi-push-decision.md).
 *
 * Enumerates contracts whose TypeId is in the env allowlist (default [10]),
 * builds the payload from the single EMPLOYER, and enqueues a push through the
 * SAME outbox path as the live flow (enqueueAqmPush + drain).
 *
 * Per the data audit there are ~32 pushable and ~58 SKIPPED (0 employers).
 *
 * Modes:
 *  - dry-run (default): report qualify / would-push / skipped counts, WRITE NOTHING.
 *  - apply (--apply): enqueue qualifying contracts. Idempotent — a second run
 *    creates 0 new PENDING rows for an already-enqueued/synced contract
 *    (guard via existing-outbox lookup; final idempotency is on the AQM side
 *    by legacy_contract_id).
 *
 * The DB layer is injected (ports below) so the enumeration/skip/dedup logic is
 * unit-testable with no live DB.
 */

import mysql from 'mysql2/promise';
import {
    AnyContractLike,
    buildBackfillCandidate,
    SkipReason,
} from './backfillCore';
import { enqueueAqmPush, isValidNipChecksum, normalizeNip } from './AqmSync';

export type { AnyContractLike, SkipReason } from './backfillCore';

/** Ports injected by the runner (or mocked in tests). */
export interface BackfillPorts {
    /** Load every contract whose TypeId is in the allowlist (with _employers). */
    loadAqmContracts: () => Promise<AnyContractLike[]>;
    /**
     * Return the set of ContractIds that already have a non-terminal outbox row
     * (PENDING or SENT) — used as the apply-mode dedup guard so a re-run does not
     * pile duplicate PENDING rows for the same ContractId.
     */
    loadEnqueuedContractIds: () => Promise<Set<number>>;
    /** Open a connection + run fn inside a transaction (apply mode only). */
    withTransaction: <T>(
        fn: (conn: mysql.PoolConnection) => Promise<T>
    ) => Promise<T>;
}

export type BackfillRow = {
    contractId: number | undefined;
    legacyEntityId: number | undefined;
    taxNr: string | undefined;
    skipReason: SkipReason | null;
    /** true = qualifies for push (no skip reason). */
    qualifies: boolean;
    /** apply-mode only: skipped because already enqueued/synced (dedup). */
    alreadyEnqueued: boolean;
    /** apply-mode only: a new PENDING outbox row was written for this contract. */
    enqueued: boolean;
};

export type BackfillReport = {
    mode: 'dry-run' | 'apply';
    total: number;
    qualify: number;
    skipped: number;
    skippedByReason: Record<SkipReason, number>;
    /** dry-run: how many WOULD push. apply: how many were newly enqueued. */
    wouldPush: number;
    enqueued: number;
    alreadyEnqueued: number;
    rows: BackfillRow[];
};

function emptySkipCounters(): Record<SkipReason, number> {
    return {
        NO_EMPLOYER: 0,
        MULTIPLE_EMPLOYERS: 0,
        BAD_NIP: 0,
    };
}

/**
 * Pure-ish backfill engine. With apply=false it touches nothing. With apply=true
 * it enqueues qualifying, not-yet-enqueued contracts via the injected ports.
 */
export async function runBackfill(
    ports: BackfillPorts,
    options: { apply: boolean }
): Promise<BackfillReport> {
    const apply = options.apply;
    const contracts = await ports.loadAqmContracts();

    const alreadyEnqueuedIds = apply
        ? await ports.loadEnqueuedContractIds()
        : new Set<number>();

    const report: BackfillReport = {
        mode: apply ? 'apply' : 'dry-run',
        total: contracts.length,
        qualify: 0,
        skipped: 0,
        skippedByReason: emptySkipCounters(),
        wouldPush: 0,
        enqueued: 0,
        alreadyEnqueued: 0,
        rows: [],
    };

    for (const contract of contracts) {
        const candidate = buildBackfillCandidate(contract, {
            isValidNip: isValidNipChecksum,
            normalizeNip,
        });

        const row: BackfillRow = {
            contractId: candidate.contractId,
            legacyEntityId: candidate.legacyEntityId,
            taxNr: candidate.taxNr,
            skipReason: candidate.skipReason,
            qualifies: candidate.skipReason === null,
            alreadyEnqueued: false,
            enqueued: false,
        };

        if (candidate.skipReason !== null) {
            report.skipped += 1;
            report.skippedByReason[candidate.skipReason] += 1;
            report.rows.push(row);
            continue;
        }

        report.qualify += 1;

        if (!apply) {
            report.wouldPush += 1;
            report.rows.push(row);
            continue;
        }

        // apply: dedup guard — skip if already enqueued/synced.
        if (
            candidate.contractId !== undefined &&
            alreadyEnqueuedIds.has(candidate.contractId)
        ) {
            row.alreadyEnqueued = true;
            report.alreadyEnqueued += 1;
            report.rows.push(row);
            continue;
        }

        await ports.withTransaction(async (conn) => {
            await enqueueAqmPush(contract as any, conn);
        });
        // Track within this run so duplicates in the same batch are deduped too.
        if (candidate.contractId !== undefined) {
            alreadyEnqueuedIds.add(candidate.contractId);
        }
        row.enqueued = true;
        report.enqueued += 1;
        report.wouldPush += 1;
        report.rows.push(row);
    }

    return report;
}
