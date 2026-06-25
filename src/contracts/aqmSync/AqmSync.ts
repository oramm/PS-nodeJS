import mysql from 'mysql2/promise';
import Setup from '../../setup/Setup';
import ToolsDb from '../../tools/ToolsDb';
import ContractOur from '../ContractOur';
import ContractOther from '../ContractOther';

/**
 * WS10 — PS ENVI -> AQM contract push.
 *
 * Frozen contract: decisions/2026-06-25-ws10-ps-envi-push-decision.md
 *  - O1: allowlist of ContractType ids (default [10]) via env AQM_SYNC_CONTRACT_TYPE_IDS
 *  - O2: NIP normalized by stripping non-digits (parity with KSeF validator)
 *  - L8: outbox row is written in the SAME transaction as the contract;
 *        the HTTP push is strictly post-commit and can NEVER roll back or
 *        throw out of the contract path.
 */

const OUTBOX_TABLE = 'AqmSyncOutbox';
const PUSH_PATH = '/api/integrations/ps-envi/contract';

export type AqmEntityPayload = {
    legacyEntityId?: number;
    name?: string;
    taxNr: string;
    address?: string;
};

export type AqmContractPayload = {
    legacyContractId?: number;
    startDate?: string;
    endDate?: string;
    gdriveFolderUrl?: string;
};

export type AqmContractPushPayload = {
    entity: AqmEntityPayload;
    contract: AqmContractPayload;
};

type AnyContract = ContractOur | ContractOther;

/**
 * Strip every non-digit. Parity with the AQM-side helper and the PS KSeF
 * validator (src/invoices/KSeF/InvoiceKsefValidator.ts): `String(nip).replace(/\D/g, '')`.
 */
export function normalizeNip(nip: unknown): string {
    return String(nip ?? '').replace(/\D/g, '');
}

/** True when the contract's typeId is in the env-driven allowlist (O1/L2). */
export function isAqmContractType(typeId: number | undefined): boolean {
    if (typeId === undefined || typeId === null) return false;
    return Setup.AqmSync.contractTypeIds.includes(typeId);
}

/**
 * Build the AQM push payload from the EMPLOYER side of the contract.
 * `_employers[0]` -> its Entity -> { legacyEntityId, name, taxNr(normalized), address }.
 * gdriveFolderUrl is derived from Contracts.GdFolderId (a folder ID, NOT a URL).
 */
export function buildAqmPayload(contract: AnyContract): AqmContractPushPayload {
    const employer = contract._employers?.[0] as any;
    if (!employer) {
        throw new Error(
            'Brak Zamawiającego (_employers[0]) — nie można zbudować payloadu AQM'
        );
    }

    const gdFolderId = contract.gdFolderId;
    const gdriveFolderUrl = gdFolderId
        ? `https://drive.google.com/drive/folders/${gdFolderId}`
        : undefined;

    return {
        entity: {
            legacyEntityId: employer.id,
            name: employer.name,
            taxNr: normalizeNip(employer.taxNumber),
            address: employer.address,
        },
        contract: {
            legacyContractId: contract.id,
            startDate: contract.startDate,
            endDate: contract.endDate,
            gdriveFolderUrl,
        },
    };
}

/**
 * Write an outbox row using the SAME connection as the contract transaction (L8).
 * Must be called from inside the contract's ToolsDb.transaction callback so the
 * outbox row commits atomically with the contract — or not at all.
 * Returns the new outbox row id (insertId).
 */
export async function enqueueAqmPush(
    contract: AnyContract,
    conn: mysql.PoolConnection
): Promise<number> {
    const payload = buildAqmPayload(contract);
    const [result] = await conn.execute(
        `INSERT INTO ${OUTBOX_TABLE} (ContractId, Payload, Status, Attempts)
         VALUES (?, ?, 'PENDING', 0)`,
        [contract.id, JSON.stringify(payload)]
    );
    return (result as mysql.ResultSetHeader).insertId;
}

type OutboxRow = {
    Id: number;
    ContractId: number;
    Payload: any;
    Status: 'PENDING' | 'SENT' | 'FAILED';
    Attempts: number;
};

function parsePayload(raw: any): AqmContractPushPayload {
    // MySQL JSON columns come back already parsed by mysql2; tolerate string too.
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

/**
 * Attempt a single HTTP delivery for one outbox row, updating its status.
 * 200 -> SENT; anything else (incl. thrown network error) -> FAILED + Attempts++ + LastError.
 * This function never throws — failures are recorded, not propagated.
 */
export async function deliverOutboxRow(
    row: OutboxRow,
    conn?: mysql.PoolConnection
): Promise<'SENT' | 'FAILED'> {
    const { baseUrl, token } = Setup.AqmSync;
    try {
        if (!baseUrl) throw new Error('AQM_SYNC_BASE_URL nie ustawione');

        const response = await fetch(`${baseUrl}${PUSH_PATH}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token ?? ''}`,
            },
            body: JSON.stringify(parsePayload(row.Payload)),
        });

        if (response.status === 200) {
            await ToolsDb.executeSQL(
                `UPDATE ${OUTBOX_TABLE}
                 SET Status = 'SENT', LastError = NULL
                 WHERE Id = ?`,
                [row.Id],
                conn
            );
            return 'SENT';
        }

        const bodyText = await response.text().catch(() => '');
        await markFailed(
            row,
            `HTTP ${response.status} ${response.statusText} ${bodyText}`.trim(),
            conn
        );
        return 'FAILED';
    } catch (err: any) {
        await markFailed(row, err?.message ?? String(err), conn).catch(
            (dbErr) =>
                console.error('[AqmSync] nie udało się zapisać FAILED:', dbErr)
        );
        return 'FAILED';
    }
}

async function markFailed(
    row: OutboxRow,
    error: string,
    conn?: mysql.PoolConnection
): Promise<void> {
    await ToolsDb.executeSQL(
        `UPDATE ${OUTBOX_TABLE}
         SET Status = 'FAILED', Attempts = Attempts + 1, LastError = ?
         WHERE Id = ?`,
        [error?.slice(0, 60000) ?? null, row.Id],
        conn
    );
}

/**
 * Post-commit best-effort delivery of a freshly enqueued row.
 * MUST be awaited OUTSIDE the contract transaction. Wrapped so a push failure
 * can never bubble into the contract path (L8).
 */
export async function tryDeliverAfterCommit(outboxId: number): Promise<void> {
    try {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT Id, ContractId, Payload, Status, Attempts
             FROM ${OUTBOX_TABLE} WHERE Id = ?`,
            undefined,
            [outboxId]
        )) as OutboxRow[];
        if (!rows?.length) return;
        await deliverOutboxRow(rows[0]);
    } catch (err) {
        // Swallow — the contract is already committed; push must never break it.
        console.error('[AqmSync] tryDeliverAfterCommit error:', err);
    }
}

/**
 * Drain PENDING/FAILED rows. Re-sends each with a small inter-row interval and
 * simple attempt-based backoff (skip rows whose Attempts exceed maxAttempts).
 * Intended to be called on an interval. Never throws.
 */
export async function drainAqmOutbox(options?: {
    batchSize?: number;
    maxAttempts?: number;
    intervalMs?: number;
}): Promise<{ sent: number; failed: number; processed: number }> {
    const batchSize = options?.batchSize ?? 50;
    const maxAttempts = options?.maxAttempts ?? 10;
    const intervalMs = options?.intervalMs ?? 200;

    const summary = { sent: 0, failed: 0, processed: 0 };

    try {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT Id, ContractId, Payload, Status, Attempts
             FROM ${OUTBOX_TABLE}
             WHERE Status IN ('PENDING', 'FAILED') AND Attempts < ?
             ORDER BY Id ASC
             LIMIT ?`,
            undefined,
            [maxAttempts, batchSize]
        )) as OutboxRow[];

        for (const row of rows ?? []) {
            const result = await deliverOutboxRow(row);
            summary.processed += 1;
            if (result === 'SENT') summary.sent += 1;
            else summary.failed += 1;
            if (intervalMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, intervalMs));
            }
        }
    } catch (err) {
        console.error('[AqmSync] drainAqmOutbox error:', err);
    }

    return summary;
}
