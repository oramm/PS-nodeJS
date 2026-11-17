import type { ContentRow, SqlContentSnapshot } from './ConsolidationReadRepository';

// Exact observed edges, including application-managed columns with no FK.
const requiredEdges: Record<string, string> = {
    'cases.milestoneid': 'milestones.id', 'cases.parentcaseid': 'cases.id',
    'tasks.caseid': 'cases.id', 'tasks_watchers.taskid': 'tasks.id',
    'letters_cases.caseid': 'cases.id', 'letters_cases.letterid': 'letters.id',
    'letterevents.letterid': 'letters.id', 'letters_entities.letterid': 'letters.id',
    'processinstances.caseid': 'cases.id', 'processinstances.taskid': 'tasks.id',
    'processesstepsinstances.processinstanceid': 'processinstances.id',
    'processesstepsinstances.ourletterid': 'letters.id',
    'risks.caseid': 'cases.id', 'securities.caseid': 'cases.id',
    'meetingarrangements.caseid': 'cases.id', 'milestonedates.milestoneid': 'milestones.id',
    'milestonecontractlinks.milestoneid': 'milestones.id', 'milestonesharingstate.milestoneid': 'milestones.id',
    'casetypefolders.milestoneid': 'milestones.id',
};
// Signing records keep their LetterId: consolidation only moves Letters_Cases edges.
// Optional modules must not become a schema requirement on installations without signing.
const edges: Record<string, string> = {...requiredEdges,
    'documentsignatures.letterid':'letters.id', 'signingjobs.letterid':'letters.id',
};
const protectedTables = new Set(['milestones', 'cases', 'tasks', 'processinstances',
    'processesstepsinstances', 'risks', 'meetingarrangements', 'milestonedates', 'securities', 'letters', 'letterevents']);
const key = (row: ContentRow) => `${row.TABLE_NAME}.${row.COLUMN_NAME}`.toLowerCase();

/** Coverage is deliberately not a transfer classifier or a readiness verdict. */
export default class ConsolidationReadCoverage {
    static inspect(snapshot: SqlContentSnapshot) {
        const blockers: { code: string; reference: string }[] = [];
        const add = (code: string, reference: string) => {
            if (!blockers.some(b => b.code === code && b.reference === reference)) blockers.push({ code, reference });
        };
        const columns = new Set(snapshot.columns.map(key));
        for (const edge of Object.keys(requiredEdges))
            if (!columns.has(edge)) add('SCHEMA_REFERENCE_MISSING', edge);
        for (const row of snapshot.foreignKeys) {
            const table = String(row.REFERENCED_TABLE_NAME).toLowerCase();
            if ((protectedTables.has(table) || edges[key(row)]) &&
                (edges[key(row)] !== `${table}.${String(row.REFERENCED_COLUMN_NAME).toLowerCase()}` || Number(row.ORDINAL_POSITION || 1) !== 1))
                add('UNHANDLED_REFERENCE', key(row));
        }
        for (const row of snapshot.columns) {
            if (/^(parentcaseid|caseid|taskid|milestoneid|processinstanceid)$/i.test(String(row.COLUMN_NAME)) && !edges[key(row)])
                add('UNHANDLED_REFERENCE', key(row));
        }
        if (snapshot.boundaryReferences) add('DEPENDENCY_OUTSIDE_READ_SCOPE', 'incoming-or-letter-reference');
        const cases = new Set(snapshot.rows.Cases.map(row => Number(row.Id)));
        const tasks = new Set(snapshot.rows.Tasks.map(row => Number(row.Id)));
        for (const row of snapshot.rows.Cases)
            if (row.ParentCaseId != null && !cases.has(Number(row.ParentCaseId)))
                add('DEPENDENCY_OUTSIDE_READ_SCOPE', `Cases:${row.Id}:ParentCaseId`);
        for (const row of snapshot.rows.ProcessInstances)
            if (row.TaskId != null && !tasks.has(Number(row.TaskId)))
                add('DEPENDENCY_OUTSIDE_READ_SCOPE', `ProcessInstances:${row.Id}:TaskId`);
        // JSON/URLs, folder aliases and semantic policies are a separate mandatory checkpoint.
        return { stage: 'SQL_INVENTORY_ONLY' as const, transferReady: false as const,
            applicationReferencesVerified: false as const, blockers,
            rowCounts: Object.fromEntries(Object.entries(snapshot.rows).map(([name, rows]) => [name, rows.length])) };
    }
}
