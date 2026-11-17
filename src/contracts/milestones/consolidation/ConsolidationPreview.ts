import { createHash, randomUUID } from 'crypto';
import Effects from './ConsolidationEffects';
import MappingValidator, { ConsolidationMappingError } from './ConsolidationMappingValidator';
import PreviewValidator from './ConsolidationPreviewValidator';

type Snapshot = Parameters<typeof Effects.analyze>[1];
export type PreviewScope = { actorId: number; projectOurId: string; participantContractIds: number[] };

/** JSON-safe canonical encoding. Refuse silent losses (undefined, Date, bigint, NaN, cycles). */
export function canonical(value: unknown, parents = new Set<object>()): string {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return JSON.stringify(value);
    if (!value || typeof value !== 'object' || parents.has(value)) throw new ConsolidationMappingError('INVALID_SNAPSHOT');
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null)
        throw new ConsolidationMappingError('INVALID_SNAPSHOT');
    if (Object.getOwnPropertySymbols(value).length) throw new ConsolidationMappingError('INVALID_SNAPSHOT');
    parents.add(value);
    try {
        if (Array.isArray(value)) {
            if (Object.keys(value).length !== value.length) throw new ConsolidationMappingError('INVALID_SNAPSHOT');
            return '[' + Array.from(value, item => canonical(item, parents)).join(',') + ']';
        }
        return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' +
            canonical((value as Record<string, unknown>)[key], parents)).join(',') + '}';
    } finally { parents.delete(value); }
}
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const sorted = <T>(items: T[]): T[] => items.slice().sort((a, b) => {
    const x = canonical(a), y = canonical(b); return x < y ? -1 : x > y ? 1 : 0;
});

/** Internal value model only. Scope is server-provided evidence, NOT an authorization decision.
 * Persistence, fresh permission checks and transactions belong to the later controller boundary.
 */
export default class ConsolidationPreview {
    static material(requestInput: unknown, snapshotInput: Snapshot, scopeInput: PreviewScope) {
        const request = MappingValidator.request(requestInput);
        PreviewValidator.scope(scopeInput, snapshotInput.projectOurId);
        // Clone first so sorting cannot mutate caller data and serialization cannot hide a field.
        const snapshot: Snapshot = JSON.parse(canonical(snapshotInput));
        const participants = [...new Set([...snapshot.rows.Milestones.map(m => Number(m.ContractId)),
            ...snapshot.rows.MilestoneContractLinks.map(l => Number(l.ContractId))])].sort((a, b) => a - b);
        if (canonical(participants) !== canonical([...new Set(scopeInput.participantContractIds)].sort((a, b) => a - b)))
            throw new ConsolidationMappingError('INVALID_SNAPSHOT');
        for (const table of Object.keys(snapshot.rows)) snapshot.rows[table] = sorted(snapshot.rows[table]);
        snapshot.columns = sorted(snapshot.columns);
        snapshot.foreignKeys = sorted(snapshot.foreignKeys);
        snapshot.indexes = sorted(snapshot.indexes);
        snapshot.caseTriggers = sorted(snapshot.caseTriggers);
        snapshot.nameWeights = sorted(snapshot.nameWeights);
        snapshot.folderReferences = sorted(snapshot.folderReferences);
        request.mappings.sort((a, b) => a.sourceCaseId - b.sourceCaseId);
        const scope = { ...scopeInput, participantContractIds: [...new Set(scopeInput.participantContractIds)].sort((a, b) => a - b) };
        const analysis = Effects.analyze(request, snapshot);
        const content = { formatVersion: 1, scope, request, snapshot, analysis };
        // Includes full text/JSON, metadata, dictionaries, aliases, hours and all analysis results.
        return { content, revision: digest(content) };
    }

    static create(request: unknown, snapshot: Snapshot, scope: PreviewScope) {
        const material = this.material(request, snapshot, scope);
        const previewId = randomUUID();
        const units = material.content.analysis.units.map(unit => ({ unitKey: unit.unitKey, unitId: randomUUID() }));
        const body = { previewId, ...material, units };
        return { ...body, integrity: digest(body) };
    }

    static serialize(preview: ReturnType<typeof ConsolidationPreview.create>): string {
        const text = canonical(preview);
        this.restore(text);
        return text;
    }

    static restore(text: string): ReturnType<typeof ConsolidationPreview.create> {
        let parsed: any;
        try { parsed = JSON.parse(text); } catch { throw new ConsolidationMappingError('INVALID_SNAPSHOT'); }
        PreviewValidator.envelope(parsed);
        const { integrity, ...body } = parsed;
        if (digest(body) !== integrity || digest(parsed.content) !== parsed.revision)
            throw new ConsolidationMappingError('SNAPSHOT_INTEGRITY_ERROR', 409);
        const rebuilt = this.material(parsed.content.request, parsed.content.snapshot, parsed.content.scope);
        if (rebuilt.revision !== parsed.revision) throw new ConsolidationMappingError('STALE_REVISION', 409);
        const keys = rebuilt.content.analysis.units.map(unit => unit.unitKey).sort();
        if (canonical(keys) !== canonical(parsed.units.map((u: any) => u.unitKey).sort()))
            throw new ConsolidationMappingError('INVALID_SNAPSHOT');
        return parsed;
    }

    /** Does not authorize apply. Caller must independently authorize every current participant. */
    static revalidate(text: string, expectedRevision: string, request: unknown, snapshot: Snapshot, scope: PreviewScope) {
        const saved = this.restore(text);
        const current = this.material(request, snapshot, scope);
        if (expectedRevision !== saved.revision || current.revision !== saved.revision)
            throw new ConsolidationMappingError('STALE_REVISION', 409);
        return saved;
    }
}
