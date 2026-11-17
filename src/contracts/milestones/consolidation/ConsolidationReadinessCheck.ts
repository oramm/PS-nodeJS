import { createHash, randomUUID } from 'crypto';
import { canonical } from './ConsolidationPreview';
import type { ReadinessRead } from './ConsolidationReadinessController';
import Access from './ConsolidationAccessValidator';
import { ConsolidationMappingError as Error } from './ConsolidationMappingValidator';
import Validator from './ConsolidationReadinessValidator';
import Operation from './ConsolidationOperation';

export type ReadinessObservation = { get?: string; file?: any; list?: string; page?: any;
    aliasFolder?: string; inUse?: boolean; failed?: boolean };

/** Immutable observation. Completion and permission to perform cleanup are separate. */
export default class ConsolidationReadinessCheck {
    static census(observations: ReadinessObservation[]) {
        const file = (input: any) => { const value = input ?? {}; return ({ id: value.id ?? null, mimeType: value.mimeType ?? null, trashed: value.trashed ?? null,
            parents: Array.isArray(value.parents) ? [...value.parents].sort() : null,
            targetId: value.shortcutDetails?.targetId ?? null, linkOwner: value.appProperties?.psMilestoneLink ?? null }); };
        const gets = new Map<string, unknown>(), lists = new Map<string, any[]>(), aliases = new Map<string, boolean>();
        for (const observation of observations) {
            if (observation.get) gets.set(observation.get, observation.failed ? { failed: true } : file(observation.file));
            if (observation.list) {
                const rows = lists.get(observation.list) ?? [];
                rows.push(...(observation.page?.files ?? []).map(file)); lists.set(observation.list, rows);
            }
            if (observation.aliasFolder) aliases.set(observation.aliasFolder, observation.inUse!);
        }
        return { gets: [...gets].sort(([a],[b]) => a.localeCompare(b)),
            lists: [...lists].sort(([a],[b]) => a.localeCompare(b)).map(([parent, rows]) => ({ parent,
                files: rows.sort((a,b) => canonical(a).localeCompare(canonical(b))) })),
            aliases: [...aliases].sort(([a],[b]) => a.localeCompare(b)) };
    }
    static response(assessment: any, checkId: string, revision: string) {
        return { operationId: assessment.operationId, checkId, revision, ready: assessment.ready,
            sourceFolderId: assessment.sourceFolderId, destinationFolderId: assessment.destinationFolderId,
            blockers: assessment.blockers, sourceTree: { complete: assessment.sourceTree.complete,
                remaining: assessment.sourceTree.remaining.map((r: { id: string }) => ({ id: r.id })) } };
    }
    static create(actorId: number, initial: ReadinessRead, fresh: ReadinessRead, assessment: any, drive: unknown[]) {
        const snapshotJSON = canonical({ version: 1, actorId, initial, fresh, drive, assessment });
        const revision = createHash('sha256').update(snapshotJSON).digest('hex');
        const result = this.response(assessment, randomUUID(), revision);
        Validator.result(result);
        return { checkId: result.checkId, operationId: initial.record.operationId, actorId,
            operationRevision: fresh.record.revision, revision, snapshotJSON, resultJSON: canonical(result), result };
    }
    static restore(row: Record<string, unknown>) {
        try {
            const checkId = Access.uuid(row.CheckId), operationId = Access.uuid(row.OperationId);
            const revision = Access.revision({ expectedRevision: row.Revision });
            if (!Number.isSafeInteger(row.ActorId) || Number(row.ActorId) <= 0 || typeof row.SnapshotJSON !== 'string' ||
                typeof row.ResultJSON !== 'string') throw new Error('SNAPSHOT_INTEGRITY_ERROR', 409);
            const snapshot = JSON.parse(row.SnapshotJSON);
            if (createHash('sha256').update(row.SnapshotJSON).digest('hex') !== revision || snapshot.version !== 1 ||
                snapshot.actorId !== row.ActorId || snapshot.initial.record.operationId !== operationId ||
                snapshot.fresh.record.operationId !== operationId || snapshot.fresh.record.revision !== row.OperationRevision ||
                canonical(this.response(snapshot.assessment, checkId, revision)) !== row.ResultJSON)
                throw new Error('SNAPSHOT_INTEGRITY_ERROR', 409);
            const result = JSON.parse(row.ResultJSON);
            Validator.result(result);
            if (!Array.isArray(snapshot.drive) || !Array.isArray(snapshot.assessment.sourceTree.folders) ||
                snapshot.assessment.sourceTree.folders.length > 10000 ||
                new Set(snapshot.assessment.sourceTree.folders).size !== snapshot.assessment.sourceTree.folders.length ||
                snapshot.assessment.sourceTree.folders.some((id: unknown) => typeof id !== 'string' || !id) ||
                snapshot.assessment.requiresRecheck !== true || snapshot.assessment.verification !== 'READ_ONLY_POINT_IN_TIME' ||
                result.ready && !snapshot.assessment.sourceTree.folders.includes(result.sourceFolderId))
                throw new Error('SNAPSHOT_INTEGRITY_ERROR', 409);
            OperationFrames(snapshot, operationId);
            return { checkId, operationId, actorId: Number(row.ActorId), revision, snapshot, result: JSON.parse(row.ResultJSON) };
        } catch { throw new Error('SNAPSHOT_INTEGRITY_ERROR', 409); }
    }
}
function OperationFrames(snapshot: any, operationId: string) {
    for (const read of [snapshot.initial, snapshot.fresh]) {
        const record = read.record;
        const state = Operation.restore(record);
        if (record.operationId !== operationId || typeof record.snapshotJSON !== 'string' ||
            createHash('sha256').update(record.snapshotJSON).digest('hex') !== record.revision ||
            !read.sql || read.sql.projectOurId !== record.projectOurId || !read.sql.rows ||
            ![1, 2, 3].includes(read.actorRole) || !Array.isArray(read.sql.columns) ||
            !Array.isArray(read.sql.foreignKeys) || !Array.isArray(read.sql.indexes) ||
            Object.values(read.sql.rows).some(rows => !Array.isArray(rows)) ||
            state.operationId !== operationId || snapshot.assessment.operationId !== operationId)
            throw new Error('SNAPSHOT_INTEGRITY_ERROR', 409);
    }
    const state = Operation.restore(snapshot.initial.record);
    const source = snapshot.initial.sql.rows.Milestones.find((r: any) => Number(r.Id) === state.sourceMilestoneId);
    const destination = snapshot.initial.sql.rows.Milestones.find((r: any) => Number(r.Id) === state.destinationMilestoneId);
    if (snapshot.assessment.sourceFolderId !== String(source?.GdFolderId || '') ||
        snapshot.assessment.destinationFolderId !== String(destination?.GdFolderId || '') ||
        snapshot.assessment.ready && canonical(snapshot.initial) !== canonical(snapshot.fresh))
        throw new Error('SNAPSHOT_INTEGRITY_ERROR', 409);
}
export type ReadinessCheckRecord = ReturnType<typeof ConsolidationReadinessCheck.create>;
