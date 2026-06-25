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
const MATCH_PATH = '/api/integrations/ps-envi/match';

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

/**
 * Validate a NIP by the full mod-11 checksum (frozen decision O2,
 * decisions/2026-06-25-ws10-ps-envi-push-decision.md):
 *  1. normalize identically to KSeF (strip non-digits), require exactly 10 digits;
 *  2. weights for positions 1..9: [6,5,7,2,3,4,5,6,7];
 *  3. c = (Σ digit[i] * weight[i]) mod 11; c === 10 → invalid;
 *  4. valid ⟺ c === digit[10];
 *  5. guard: reject all-zeros (passes a raw checksum but is not a real NIP).
 * This is STRICTER than the rest of PS on purpose: tax_nr is the AQM dedup key.
 */
export function isValidNipChecksum(nip: unknown): boolean {
    const digits = normalizeNip(nip);
    if (!/^[0-9]{10}$/.test(digits)) return false;
    if (digits === '0000000000') return false;
    const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
    let sum = 0;
    for (let i = 0; i < 9; i++) {
        sum += Number(digits[i]) * weights[i];
    }
    const c = sum % 11;
    if (c === 10) return false;
    return c === Number(digits[9]);
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
    row: OutboxRow
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
                [row.Id]
            );
            return 'SENT';
        }

        const bodyText = await response.text().catch(() => '');
        await markFailed(
            row,
            `HTTP ${response.status} ${response.statusText} ${bodyText}`.trim()
        );
        return 'FAILED';
    } catch (err: any) {
        await markFailed(row, err?.message ?? String(err)).catch(
            (dbErr) =>
                console.error('[AqmSync] nie udało się zapisać FAILED:', dbErr)
        );
        return 'FAILED';
    }
}

async function markFailed(
    row: OutboxRow,
    error: string
): Promise<void> {
    await ToolsDb.executeSQL(
        `UPDATE ${OUTBOX_TABLE}
         SET Status = 'FAILED', Attempts = Attempts + 1, LastError = ?
         WHERE Id = ?`,
        [error?.slice(0, 60000) ?? null, row.Id]
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
 * Drain PENDING/FAILED rows. Re-sends each with simple attempt-based backoff
 * (skip rows whose Attempts exceed maxAttempts).
 * Intended to be called on an interval. Never throws.
 */
export async function drainAqmOutbox(options?: {
    batchSize?: number;
    maxAttempts?: number;
}): Promise<{ sent: number; failed: number; processed: number }> {
    const batchSize = options?.batchSize ?? 50;
    const maxAttempts = options?.maxAttempts ?? 10;

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
        }
    } catch (err) {
        console.error('[AqmSync] drainAqmOutbox error:', err);
    }

    return summary;
}

export type AqmMatchProxyResult = {
    status: number;
    body: any;
};

/**
 * Server-side call to the AQM match endpoint (L11 preview), used by the PS
 * `/aqm/match` proxy. The AQM Bearer token (Setup.AqmSync.token) is attached
 * here and NEVER reaches the browser. Read-only; relays AQM's status + JSON.
 * On misconfiguration / network error returns a 502 with a soft body so the
 * front can degrade gracefully (match preview is non-blocking).
 */
export async function fetchAqmMatch(query: {
    taxNr: string;
    name?: string;
}): Promise<AqmMatchProxyResult> {
    const { baseUrl, token } = Setup.AqmSync;
    if (!baseUrl) {
        return {
            status: 502,
            body: { match: 'NONE', organization: null, error: 'AQM_SYNC_BASE_URL nie ustawione' },
        };
    }

    const params = new URLSearchParams();
    params.set('taxNr', query.taxNr ?? '');
    if (query.name) params.set('name', query.name);

    try {
        const response = await fetch(
            `${baseUrl}${MATCH_PATH}?${params.toString()}`,
            {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token ?? ''}`,
                },
            }
        );
        const body = await response.json().catch(() => null);
        return { status: response.status, body };
    } catch (err: any) {
        return {
            status: 502,
            body: {
                match: 'NONE',
                organization: null,
                error: err?.message ?? String(err),
            },
        };
    }
}
