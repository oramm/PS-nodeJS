import BaseRepository from '../repositories/BaseRepository';
import ToolsDb from '../tools/ToolsDb';
import { ResultSetHeader } from 'mysql2/promise';
import {
    BUG_STATUSES,
    BugSeverity,
    BugSource,
    BugEventOccurrencePayload,
    BugEventRecord,
    BugStatus,
} from './BugEvent';

interface BugEventRow {
    id: number;
    fingerprint: string;
    status: string;
    severity: string;
    source: string;
    message: string;
    stack: string | null;
    request_context: string | null;
    user_context: string | null;
    env: string;
    first_seen_at: string;
    last_seen_at: string;
    occurrence_count: number;
    github_issue_number: number | null;
    resolution_notes: string | null;
    fixed_commit_sha: string | null;
    resolved_at: string | null;
    tags: string | null;
    priority_score: number;
}

export default class BugEventRepository extends BaseRepository<BugEventRecord> {
    constructor() {
        super('BugEvents');
    }

    protected mapRowToModel(row: BugEventRow): BugEventRecord {
        const status: BugStatus = BUG_STATUSES.includes(row.status as BugStatus)
            ? (row.status as BugStatus)
            : 'new';

        return {
            id: row.id,
            fingerprint: row.fingerprint,
            status,
            severity: (row.severity as BugEventRecord['severity']) || 'low',
            source: (row.source as BugEventRecord['source']) || 'manual',
            message: row.message,
            stack: row.stack,
            requestContext: row.request_context
                ? (JSON.parse(row.request_context) as Record<string, unknown>)
                : null,
            userContext: row.user_context
                ? (JSON.parse(row.user_context) as Record<string, unknown>)
                : null,
            env: row.env,
            firstSeenAt: row.first_seen_at,
            lastSeenAt: row.last_seen_at,
            occurrenceCount: row.occurrence_count,
            githubIssueNumber: row.github_issue_number,
            resolutionNotes: row.resolution_notes,
            fixedCommitSha: row.fixed_commit_sha,
            resolvedAt: row.resolved_at,
            tags: row.tags ? (JSON.parse(row.tags) as string[]) : null,
            priorityScore: row.priority_score,
        };
    }

    async find(conditions?: {
        statuses?: BugStatus[];
        severities?: BugSeverity[];
        sources?: BugSource[];
        fingerprint?: string;
        limit?: number;
    }): Promise<BugEventRecord[]> {
        const statuses = conditions?.statuses || ['new', 'triaged'];
        const limit = Math.max(1, conditions?.limit || 50);
        const whereParts: string[] = [];
        const params: unknown[] = [];

        if (statuses.length > 0) {
            whereParts.push(`status IN (${statuses.map(() => '?').join(', ')})`);
            params.push(...statuses);
        }

        if (conditions?.severities && conditions.severities.length > 0) {
            whereParts.push(
                `severity IN (${conditions.severities.map(() => '?').join(', ')})`
            );
            params.push(...conditions.severities);
        }

        if (conditions?.sources && conditions.sources.length > 0) {
            whereParts.push(`source IN (${conditions.sources.map(() => '?').join(', ')})`);
            params.push(...conditions.sources);
        }

        if (conditions?.fingerprint) {
            whereParts.push('fingerprint = ?');
            params.push(conditions.fingerprint);
        }

        const where = whereParts.length > 0 ? whereParts.join(' AND ') : '1';
        const sql = `
            SELECT
                id,
                fingerprint,
                status,
                severity,
                source,
                message,
                stack,
                request_context,
                user_context,
                env,
                first_seen_at,
                last_seen_at,
                occurrence_count,
                github_issue_number,
                resolution_notes,
                fixed_commit_sha,
                resolved_at,
                tags,
                priority_score
            FROM BugEvents
            WHERE ${where}
            ORDER BY priority_score DESC, last_seen_at DESC
            LIMIT ?
        `;

        params.push(limit);
        const rows = (await ToolsDb.getQueryCallbackAsync(
            sql,
            undefined,
            params as any[]
        )) as BugEventRow[];

        return rows.map((row) => this.mapRowToModel(row));
    }

    async getInboxCandidates(limit = 10): Promise<BugEventRecord[]> {
        return this.find({
            statuses: ['new', 'triaged'],
            limit,
        });
    }

    async saveOccurrence(payload: BugEventOccurrencePayload): Promise<number> {
        const ledgerInsert = (await ToolsDb.getQueryCallbackAsync(
            `
                INSERT IGNORE INTO BugEventOccurrenceLedger (occurrence_key, fingerprint)
                VALUES (?, ?)
            `,
            undefined,
            [payload.occurrenceKey, payload.fingerprint]
        )) as ResultSetHeader;

        if (ledgerInsert.affectedRows === 0) {
            const rows = (await ToolsDb.getQueryCallbackAsync(
                'SELECT id FROM BugEvents WHERE fingerprint = ? LIMIT 1',
                undefined,
                [payload.fingerprint]
            )) as Array<{ id: number }>;

            if (Array.isArray(rows) && rows.length > 0) {
                return rows[0].id;
            }

            // Self-healing path for a partial crash window: ledger exists but BugEvents row is missing.
            return this.upsertBugEvent(payload);
        }

        return this.upsertBugEvent(payload);
    }

    private async upsertBugEvent(payload: BugEventOccurrencePayload): Promise<number> {

        const sql = `
            INSERT INTO BugEvents (
                fingerprint,
                status,
                severity,
                source,
                message,
                stack,
                request_context,
                user_context,
                env,
                first_seen_at,
                last_seen_at,
                occurrence_count,
                tags,
                priority_score
            ) VALUES (?, 'new', ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                last_seen_at = UTC_TIMESTAMP(),
                occurrence_count = occurrence_count + VALUES(occurrence_count),
                message = COALESCE(VALUES(message), message),
                stack = COALESCE(VALUES(stack), stack),
                request_context = COALESCE(VALUES(request_context), request_context),
                user_context = COALESCE(VALUES(user_context), user_context),
                severity = CASE
                    WHEN FIELD(VALUES(severity), 'low', 'medium', 'high', 'critical') > FIELD(severity, 'low', 'medium', 'high', 'critical')
                    THEN VALUES(severity)
                    ELSE severity
                END,
                priority_score = GREATEST(priority_score, VALUES(priority_score))
        `;

        const params = [
            payload.fingerprint,
            payload.severity,
            payload.source,
            payload.message,
            payload.stack || null,
            payload.requestContext ? JSON.stringify(payload.requestContext) : null,
            payload.userContext ? JSON.stringify(payload.userContext) : null,
            payload.env,
            payload.occurrenceCount,
            payload.tags ? JSON.stringify(payload.tags) : null,
            payload.priorityScore,
        ];

        await ToolsDb.getQueryCallbackAsync(sql, undefined, params);

        const rows = (await ToolsDb.getQueryCallbackAsync(
            'SELECT id FROM BugEvents WHERE fingerprint = ? LIMIT 1',
            undefined,
            [payload.fingerprint]
        )) as Array<{ id: number }>;

        if (!Array.isArray(rows) || rows.length === 0) {
            throw new Error('Could not resolve BugEvent id after upsert.');
        }

        return rows[0].id;
    }

    async markStatus(id: number, status: BugStatus, resolutionNotes?: string): Promise<void> {
        const sql = `
            UPDATE BugEvents
            SET
                status = ?,
                resolution_notes = COALESCE(?, resolution_notes),
                resolved_at = CASE WHEN ? IN ('fixed', 'ignored') THEN UTC_TIMESTAMP() ELSE resolved_at END
            WHERE id = ?
        `;

        await ToolsDb.getQueryCallbackAsync(sql, undefined, [
            status,
            resolutionNotes || null,
            status,
            id,
        ]);
    }

    async linkGithubIssue(id: number, issueNumber: number): Promise<void> {
        await ToolsDb.getQueryCallbackAsync(
            'UPDATE BugEvents SET github_issue_number = ?, status = IF(status = \"new\", \"triaged\", status) WHERE id = ?',
            undefined,
            [issueNumber, id]
        );
    }

    async archiveResolvedOlderThan(months = 6): Promise<{
        archivedCount: number;
        deletedCount: number;
    }> {
        const safeMonths = Math.max(1, Math.floor(months));

        const insertArchiveSql = `
            INSERT INTO BugEventsArchive (
                bug_event_id,
                fingerprint,
                status,
                severity,
                source,
                message,
                stack,
                request_context,
                user_context,
                env,
                first_seen_at,
                last_seen_at,
                occurrence_count,
                github_issue_number,
                resolution_notes,
                fixed_commit_sha,
                resolved_at,
                tags,
                priority_score
            )
            SELECT
                b.id,
                b.fingerprint,
                b.status,
                b.severity,
                b.source,
                b.message,
                b.stack,
                b.request_context,
                b.user_context,
                b.env,
                b.first_seen_at,
                b.last_seen_at,
                b.occurrence_count,
                b.github_issue_number,
                b.resolution_notes,
                b.fixed_commit_sha,
                b.resolved_at,
                b.tags,
                b.priority_score
            FROM BugEvents b
            WHERE b.status IN ('fixed', 'ignored')
              AND b.resolved_at IS NOT NULL
              AND b.resolved_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MONTH)
              AND NOT EXISTS (
                  SELECT 1
                  FROM BugEventsArchive a
                  WHERE a.bug_event_id = b.id
              )
        `;

        const insertResult = (await ToolsDb.getQueryCallbackAsync(
            insertArchiveSql,
            undefined,
            [safeMonths]
        )) as ResultSetHeader;

        const deleteSql = `
            DELETE b
            FROM BugEvents b
            INNER JOIN BugEventsArchive a ON a.bug_event_id = b.id
            WHERE b.status IN ('fixed', 'ignored')
              AND b.resolved_at IS NOT NULL
              AND b.resolved_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MONTH)
        `;

        const deleteResult = (await ToolsDb.getQueryCallbackAsync(
            deleteSql,
            undefined,
            [safeMonths]
        )) as ResultSetHeader;

        return {
            archivedCount: insertResult.affectedRows || 0,
            deletedCount: deleteResult.affectedRows || 0,
        };
    }
}
