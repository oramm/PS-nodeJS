import mysql from 'mysql2/promise';
import Setup from '../../setup/Setup';
import ToolsDb from '../../tools/ToolsDb';
import ContractOur from '../ContractOur';
import ContractOther from '../ContractOther';
import Entity from '../../entities/Entity';
import Project from '../../projects/Project';
import { isValidNipChecksum } from '../aqmSync/AqmSync';

/**
 * SYNC-P1 — PS ENVI -> FIDman sync.
 *
 * Second consumer of the WS10 outbox pattern (see ../aqmSync/AqmSync.ts). Mirrors
 * it verbatim where possible; deliberate simplifications are marked `// ponytail:`.
 *
 *  - Type filter: allowlist of ContractType ids (default [3,4]) via env
 *    FIDMAN_SYNC_CONTRACT_TYPE_IDS.
 *  - L8: the outbox row is written in the SAME transaction as the business write;
 *        the HTTP push is strictly post-commit and can NEVER roll back or throw
 *        out of the business path.
 *  - Target: FidmanSyncOutbox — a SEPARATE table from AqmSyncOutbox. Shared
 *        drainer *code*, not shared rows.
 *
 * FIDman ingest contract (already deployed):
 *   POST /api/ps-sync, Bearer fail-closed, body { kind, payload },
 *   response { created, updated, skipped:[{legacyEntityId, reason}] }.
 * FIDman owns dedup (by legacy_*_id then normalized NIP), defaults and no-clobber,
 * so we send PS legacy ids + source-owned fields only.
 */

const OUTBOX_TABLE = 'FidmanSyncOutbox';
const PUSH_PATH = '/api/ps-sync';

type AnyContract = ContractOur | ContractOther;

export type FidmanKind =
    | 'contract.upsert'
    | 'entity.upsert'
    | 'project.upsert';

export type FidmanRole = 'EMPLOYER' | 'ENGINEER' | 'CONTRACTOR';

// Field names match the FIDman ingest wire schema (apps/api/src/ps-sync/validation.ts),
// NOT FIDman's internal DB columns. FIDman maps them to columns on its side.
export type FidmanEntityPayload = {
    legacyEntityId?: number;
    name?: string;
    /** PS TaxNumber sent as-is (even null); FIDman normalizes and decides NO_NIP. */
    taxNumber: string | null;
    www?: string;
    email?: string;
    phone?: string;
    address?: string;
    role?: FidmanRole;
};

export type FidmanProjectRef = {
    legacyProjectId?: number;
    /** PS OurId — natural key. */
    ourId?: string;
};

export type FidmanContractPayload = {
    legacyContractId?: number;
    /** PS Number. */
    number: string | null;
    name: string | null;
    startDate: string | null;
    endDate: string | null;
    project?: FidmanProjectPayload;
    entities: FidmanEntityPayload[];
};

export type FidmanProjectPayload = FidmanProjectRef & {
    name?: string;
    comment?: string;
};

export type FidmanEnvelope =
    | { kind: 'contract.upsert'; payload: FidmanContractPayload }
    | { kind: 'entity.upsert'; payload: FidmanEntityPayload }
    | { kind: 'project.upsert'; payload: FidmanProjectPayload };

export type FidmanIngestResponse = {
    created?: number;
    updated?: number;
    // DM-L1: FIDman echoes its own fidschm.contracts.id for a contract.upsert so PS can store the
    // reverse link (Contracts.FidmanContractId). Absent for entity/project pushes.
    contractId?: number;
    skipped?: { legacyEntityId?: number | null; reason?: string }[];
};

/** True when the contract's typeId is in the env-driven allowlist. */
export function isFidmanContractType(typeId: number | undefined): boolean {
    if (typeId === undefined || typeId === null) return false;
    return Setup.FidmanSync.contractTypeIds.includes(typeId);
}

// ponytail: PS Entity has no `fax` column (see src/entities/Entity.ts); the brief
// lists fax but the source field does not exist, so it is omitted. FIDman applies
// its own defaults/no-clobber for anything we do not send.
function buildEntityPayload(
    entity: any,
    role?: FidmanRole
): FidmanEntityPayload {
    return {
        legacyEntityId: entity?.id,
        name: entity?.name,
        taxNumber: entity?.taxNumber ?? null,
        www: entity?.www,
        email: entity?.email,
        phone: entity?.phone,
        address: entity?.address,
        ...(role ? { role } : {}),
    };
}

function collectContractEntities(contract: any): FidmanEntityPayload[] {
    const groups: [FidmanRole, any[] | undefined][] = [
        ['EMPLOYER', contract._employers],
        ['ENGINEER', contract._engineers],
        ['CONTRACTOR', contract._contractors],
    ];
    const out: FidmanEntityPayload[] = [];
    for (const [role, list] of groups) {
        for (const entity of list ?? []) {
            out.push(buildEntityPayload(entity, role));
        }
    }
    return out;
}

/**
 * Build the FIDman `contract.upsert` envelope: the contract + inline project ref
 * + entities-with-roles. Source-owned fields only (FIDman owns its own fields).
 */
export function buildContractPayload(contract: AnyContract): FidmanEnvelope {
    const c = contract as any;
    // R7-P1: carry the REAL project name (ContractRepository loads it as _project.name),
    // not just the natural key. Without it FIDman's `p.name ?? p.ourId` insert fallback
    // seeds projects.name = ourId → the "Nazwa == Numer" bug in Słowniki → Projekty.
    // (comment is not loaded onto a contract's _project, so it stays omitted — the
    // standalone project.upsert still carries it.)
    const project: FidmanProjectPayload | undefined = c._project
        ? { legacyProjectId: c._project.id, ourId: c._project.ourId, name: c._project.name }
        : undefined;

    return {
        kind: 'contract.upsert',
        payload: {
            legacyContractId: c.id,
            number: c.number ?? null,
            name: c.name ?? null,
            startDate: c.startDate ?? null,
            endDate: c.endDate ?? null,
            ...(project ? { project } : {}),
            entities: collectContractEntities(c),
        },
    };
}

/** Build the FIDman `entity.upsert` envelope for a standalone Entity update. */
export function buildEntityUpsert(entity: Entity): FidmanEnvelope {
    return { kind: 'entity.upsert', payload: buildEntityPayload(entity) };
}

/** Build the FIDman `project.upsert` envelope for a standalone Project update. */
export function buildProjectUpsert(project: Project): FidmanEnvelope {
    const p = project as any;
    return {
        kind: 'project.upsert',
        payload: {
            legacyProjectId: p.id,
            ourId: p.ourId,
            name: p.name,
            comment: p.comment,
        },
    };
}

/**
 * Write an outbox row using the SAME connection as the business transaction (L8).
 * Must be called from inside the caller's ToolsDb.transaction callback so the row
 * commits atomically with the business write — or not at all. Returns insertId.
 */
async function enqueueRow(
    envelope: FidmanEnvelope,
    refId: number | undefined,
    conn: mysql.PoolConnection
): Promise<number> {
    const [result] = await conn.execute(
        `INSERT INTO ${OUTBOX_TABLE} (Kind, RefId, Payload, Status, Attempts)
         VALUES (?, ?, ?, 'PENDING', 0)`,
        [envelope.kind, refId ?? null, JSON.stringify(envelope.payload)]
    );
    return (result as mysql.ResultSetHeader).insertId;
}

export async function enqueueFidmanContractPush(
    contract: AnyContract,
    conn: mysql.PoolConnection
): Promise<number> {
    return enqueueRow(buildContractPayload(contract), (contract as any).id, conn);
}

export async function enqueueFidmanEntityPush(
    entity: Entity,
    conn: mysql.PoolConnection
): Promise<number> {
    return enqueueRow(buildEntityUpsert(entity), entity.id, conn);
}

export async function enqueueFidmanProjectPush(
    project: Project,
    conn: mysql.PoolConnection
): Promise<number> {
    return enqueueRow(buildProjectUpsert(project), (project as any).id, conn);
}

function typeIdInClause(): { clause: string; ids: number[] } {
    const ids = Setup.FidmanSync.contractTypeIds;
    const clause = ids.map(() => '?').join(',');
    return { clause, ids };
}

async function runGuardQuery(
    sql: string,
    params: any[],
    conn?: mysql.PoolConnection
): Promise<boolean> {
    const rows = conn
        ? ((await conn.query(sql, params))[0] as any[])
        : ((await ToolsDb.getQueryCallbackAsync(sql, undefined, params)) as any[]);
    return Array.isArray(rows) && rows.length > 0;
}

/** True when the entity is a party of ≥1 synced-type contract. */
export async function entityHasSyncedContract(
    entityId: number | undefined,
    conn?: mysql.PoolConnection
): Promise<boolean> {
    const { clause, ids } = typeIdInClause();
    if (entityId == null || ids.length === 0) return false;
    const sql = `SELECT 1
                 FROM Contracts_Entities ce
                 JOIN Contracts c ON c.Id = ce.ContractId
                 WHERE ce.EntityId = ? AND c.TypeId IN (${clause})
                 LIMIT 1`;
    return runGuardQuery(sql, [entityId, ...ids], conn);
}

/** True when the project (by OurId) is the parent of ≥1 synced-type contract. */
export async function projectHasSyncedContract(
    projectOurId: string | undefined,
    conn?: mysql.PoolConnection
): Promise<boolean> {
    const { clause, ids } = typeIdInClause();
    if (!projectOurId || ids.length === 0) return false;
    const sql = `SELECT 1
                 FROM Contracts c
                 WHERE c.ProjectOurId = ? AND c.TypeId IN (${clause})
                 LIMIT 1`;
    return runGuardQuery(sql, [projectOurId, ...ids], conn);
}

type OutboxRow = {
    Id: number;
    Kind: FidmanKind;
    RefId: number;
    Payload: any;
    Status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
    Attempts: number;
    SkipReason: string | null;
};

function parsePayload(raw: any): any {
    // MySQL JSON columns come back already parsed by mysql2; tolerate string too.
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function markFailed(row: OutboxRow, error: string): Promise<void> {
    await ToolsDb.executeSQL(
        `UPDATE ${OUTBOX_TABLE}
         SET Status = 'FAILED', Attempts = Attempts + 1, LastError = ?
         WHERE Id = ?`,
        [error?.slice(0, 60000) ?? null, row.Id]
    );
}

/**
 * Attempt a single HTTP delivery for one outbox row, updating its status.
 *  200 + no skip  -> SENT
 *  200 + skip     -> SKIPPED + SkipReason (NEEDS_DATA / NO_NIP) — NOT a failure
 *  anything else / thrown -> FAILED + Attempts++ + LastError
 * Never throws — failures are recorded, not propagated.
 */
export async function deliverOutboxRow(
    row: OutboxRow
): Promise<'SENT' | 'FAILED' | 'SKIPPED'> {
    const { baseUrl, token } = Setup.FidmanSync;
    try {
        if (!baseUrl) throw new Error('FIDMAN_SYNC_BASE_URL nie ustawione');

        const response = await fetch(`${baseUrl}${PUSH_PATH}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token ?? ''}`,
            },
            body: JSON.stringify({
                kind: row.Kind,
                payload: parsePayload(row.Payload),
            }),
        });

        if (response.status === 200) {
            const body = (await response
                .json()
                .catch(() => null)) as FidmanIngestResponse | null;
            const skip = body?.skipped?.[0];
            if (skip) {
                await ToolsDb.executeSQL(
                    `UPDATE ${OUTBOX_TABLE}
                     SET Status = 'SKIPPED', SkipReason = ?, LastError = NULL
                     WHERE Id = ?`,
                    [skip.reason ?? null, row.Id]
                );
                return 'SKIPPED';
            }
            await ToolsDb.executeSQL(
                `UPDATE ${OUTBOX_TABLE}
                 SET Status = 'SENT', SkipReason = NULL, LastError = NULL
                 WHERE Id = ?`,
                [row.Id]
            );
            // DM-L1 reverse link: persist FIDman's own contract id (PK↔PK) onto PS Contracts.
            // RefId of a contract.upsert row = PS Contracts.Id (see enqueueRow). No-clobber:
            // only fill when empty — never overwrite a non-null with a different id.
            if (row.Kind === 'contract.upsert' && typeof body?.contractId === 'number') {
                await ToolsDb.executeSQL(
                    `UPDATE Contracts SET FidmanContractId = ?
                     WHERE Id = ? AND FidmanContractId IS NULL`,
                    [body.contractId, row.RefId]
                );
            }
            return 'SENT';
        }

        const bodyText = await response.text().catch(() => '');
        await markFailed(
            row,
            `HTTP ${response.status} ${response.statusText} ${bodyText}`.trim()
        );
        return 'FAILED';
    } catch (err: any) {
        await markFailed(row, err?.message ?? String(err)).catch((dbErr) =>
            console.error('[FidmanSync] nie udało się zapisać FAILED:', dbErr)
        );
        return 'FAILED';
    }
}

/**
 * Post-commit best-effort delivery of a freshly enqueued row.
 * MUST be awaited OUTSIDE the business transaction. Wrapped so a push failure
 * can never bubble into the business path (L8).
 *
 * Gotcha (go-live playbook): on an Eco/idling dyno the drainer interval may not
 * fire — this post-commit attempt is the primary delivery, the drainer is the
 * backstop. Same shape as AqmSync.tryDeliverAfterCommit.
 */
export async function tryDeliverAfterCommit(outboxId: number): Promise<void> {
    try {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT Id, Kind, RefId, Payload, Status, Attempts, SkipReason
             FROM ${OUTBOX_TABLE} WHERE Id = ?`,
            undefined,
            [outboxId]
        )) as OutboxRow[];
        if (!rows?.length) return;
        await deliverOutboxRow(rows[0]);
    } catch (err) {
        // Swallow — the business write is already committed; push must never break it.
        console.error('[FidmanSync] tryDeliverAfterCommit error:', err);
    }
}

export type FidmanSyncStatus = {
    contractId: number;
    kind: FidmanKind;
    status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED' | 'NONE';
    skipReason: string | null;
    skipReasonLabel: string | null;
    lastError: string | null;
    attempts: number;
    updatedAt: string | null;
};

/** Human-readable meaning of a FIDman SkipReason, for the "awizo braków" UI. */
export function fidmanSkipReasonLabel(reason: string | null): string | null {
    switch (reason) {
        case 'NEEDS_DATA':
            return 'FIDman potrzebuje uzupełnienia danych kontrahenta, aby zaktualizować rekord.';
        case 'NO_NIP':
            return 'Brak numeru NIP kontrahenta — FIDman nie może dopasować/utworzyć rekordu bez NIP.';
        default:
            return reason ? `Nieznany powód pominięcia: ${reason}` : null;
    }
}

/**
 * SYNC-P2 — read the most recent `contract.upsert` outbox row for a contract, for
 * the "synchronizacja do dopchnięcia" status badge on the contract list/card.
 * Returns status 'NONE' (no LastError/Attempts/reason) when the contract was never
 * enqueued (e.g. non-synced type, or created before P1 shipped).
 */
export async function getFidmanContractSyncStatus(
    contractId: number
): Promise<FidmanSyncStatus> {
    const rows = (await ToolsDb.getQueryCallbackAsync(
        `SELECT Id, Status, SkipReason, LastError, Attempts, UpdatedAt
         FROM ${OUTBOX_TABLE}
         WHERE Kind = 'contract.upsert' AND RefId = ?
         ORDER BY Id DESC
         LIMIT 1`,
        undefined,
        [contractId]
    )) as any[];

    const row = rows?.[0];
    if (!row) {
        return {
            contractId,
            kind: 'contract.upsert',
            status: 'NONE',
            skipReason: null,
            skipReasonLabel: null,
            lastError: null,
            attempts: 0,
            updatedAt: null,
        };
    }
    return {
        contractId,
        kind: 'contract.upsert',
        status: row.Status,
        skipReason: row.SkipReason ?? null,
        skipReasonLabel: fidmanSkipReasonLabel(row.SkipReason ?? null),
        lastError: row.LastError ?? null,
        attempts: row.Attempts ?? 0,
        updatedAt: row.UpdatedAt ?? null,
    };
}

/**
 * SYNC-P2 — manual "dopchnij synchronizację" action: re-deliver the most recent
 * FAILED/SKIPPED `contract.upsert` outbox row for a contract using the SAME
 * `deliverOutboxRow` P1 uses (no reimplementation of the HTTP/status logic).
 *
 * // ponytail: re-delivers the row's existing Payload snapshot rather than
 * // rebuilding it from live contract/entity data — rebuilding would require
 * // re-joining the full contract (employers/engineers/contractors) here, which
 * // duplicates ContractsController's assembly logic. In practice a source-data
 * // fix (contract edit or Entity edit) already re-enqueues a fresh row via the
 * // existing P1 wiring, so "dopchnij" is for retrying a transient delivery
 * // failure, not for re-snapshotting stale payloads.
 */
export async function retryFidmanContractSync(
    contractId: number
): Promise<
    | { ok: true; status: FidmanSyncStatus }
    | { ok: false; reason: 'NOT_FOUND' }
> {
    const rows = (await ToolsDb.getQueryCallbackAsync(
        `SELECT Id, Kind, RefId, Payload, Status, Attempts, SkipReason
         FROM ${OUTBOX_TABLE}
         WHERE Kind = 'contract.upsert' AND RefId = ? AND Status IN ('FAILED', 'SKIPPED')
         ORDER BY Id DESC
         LIMIT 1`,
        undefined,
        [contractId]
    )) as OutboxRow[];

    const row = rows?.[0];
    if (!row) return { ok: false, reason: 'NOT_FOUND' };

    await deliverOutboxRow(row);
    return { ok: true, status: await getFidmanContractSyncStatus(contractId) };
}

/**
 * Drain PENDING/FAILED rows (SKIPPED rows are left alone — they need a source-data
 * fix, not a re-send). Re-sends each with simple attempt-based backoff.
 * Intended to be called on an interval. Never throws.
 */
export async function drainFidmanOutbox(options?: {
    batchSize?: number;
    maxAttempts?: number;
}): Promise<{
    sent: number;
    failed: number;
    skipped: number;
    processed: number;
}> {
    const batchSize = options?.batchSize ?? 50;
    const maxAttempts = options?.maxAttempts ?? 10;

    const summary = { sent: 0, failed: 0, skipped: 0, processed: 0 };

    try {
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT Id, Kind, RefId, Payload, Status, Attempts, SkipReason
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
            else if (result === 'SKIPPED') summary.skipped += 1;
            else summary.failed += 1;
        }
    } catch (err) {
        console.error('[FidmanSync] drainFidmanOutbox error:', err);
    }

    return summary;
}

export type FidmanNipGapEntity = {
    entityId: number;
    name: string | null;
    taxNumber: string | null;
    /** Synced-type contracts (this allowlist, non-Archiwalny) where this entity is a party. */
    contractIds: number[];
    reason: 'NO_NIP';
    reasonLabel: string | null;
};

export type FidmanNeedsDataContract = {
    contractId: number;
    number: string | null;
    name: string | null;
    reason: 'NEEDS_DATA';
    reasonLabel: string | null;
};

export type FidmanNipGapReport = {
    noNip: FidmanNipGapEntity[];
    needsData: FidmanNeedsDataContract[];
};

/**
 * SYNC-P3 — "awizowanie braków": read-only gap list for the same scope as the
 * B1 backfill (TypeId allowlist, Status <> 'Archiwalny'):
 *  - noNip: distinct entities that are a party of ≥1 synced-type contract and
 *    whose TaxNumber does not pass isValidNipChecksum (missing or malformed).
 *  - needsData: synced-type contracts missing StartDate or EndDate.
 * Reuses the type-id allowlist helper (typeIdInClause) and the P2 skip-reason
 * label (fidmanSkipReasonLabel) — no new screen, this is the data source for
 * whatever surface (badge/list) wants to render it.
 */
export async function getFidmanNipGapReport(): Promise<FidmanNipGapReport> {
    const { clause, ids } = typeIdInClause();
    if (ids.length === 0) return { noNip: [], needsData: [] };

    const entityRows = (await ToolsDb.getQueryCallbackAsync(
        `SELECT ce.EntityId AS entityId, e.Name AS name, e.TaxNumber AS taxNumber,
                ce.ContractId AS contractId
         FROM Contracts_Entities ce
         JOIN Contracts c ON c.Id = ce.ContractId
         JOIN Entities e ON e.Id = ce.EntityId
         WHERE c.TypeId IN (${clause}) AND c.Status <> 'Archiwalny'`,
        undefined,
        ids
    )) as {
        entityId: number;
        name: string | null;
        taxNumber: string | null;
        contractId: number;
    }[];

    const byEntity = new Map<number, FidmanNipGapEntity>();
    for (const row of entityRows ?? []) {
        if (isValidNipChecksum(row.taxNumber)) continue;
        const existing = byEntity.get(row.entityId);
        if (existing) {
            existing.contractIds.push(row.contractId);
        } else {
            byEntity.set(row.entityId, {
                entityId: row.entityId,
                name: row.name,
                taxNumber: row.taxNumber,
                contractIds: [row.contractId],
                reason: 'NO_NIP',
                reasonLabel: fidmanSkipReasonLabel('NO_NIP'),
            });
        }
    }

    const contractRows = (await ToolsDb.getQueryCallbackAsync(
        `SELECT Id AS contractId, Number AS number, Name AS name
         FROM Contracts
         WHERE TypeId IN (${clause}) AND Status <> 'Archiwalny'
           AND (StartDate IS NULL OR EndDate IS NULL)`,
        undefined,
        ids
    )) as { contractId: number; number: string | null; name: string | null }[];

    return {
        noNip: [...byEntity.values()],
        needsData: (contractRows ?? []).map((row) => ({
            ...row,
            reason: 'NEEDS_DATA' as const,
            reasonLabel: fidmanSkipReasonLabel('NEEDS_DATA'),
        })),
    };
}
