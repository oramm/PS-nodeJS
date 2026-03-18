export const BUG_STATUSES = [
    'new',
    'triaged',
    'in_progress',
    'waiting_human',
    'fixed',
    'ignored',
] as const;

export type BugStatus = (typeof BUG_STATUSES)[number];

export const BUG_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type BugSeverity = (typeof BUG_SEVERITIES)[number];

export type BugSource =
    | 'express_error_middleware'
    | 'process_uncaught_exception'
    | 'process_unhandled_rejection'
    | 'frontend'
    | 'manual';

export interface BugCaptureInput {
    error: unknown;
    source: BugSource;
    env: string;
    requestContext?: Record<string, unknown>;
    userContext?: Record<string, unknown>;
    tags?: string[];
}

export interface BugEventOccurrencePayload {
    occurrenceKey: string;
    fingerprint: string;
    severity: BugSeverity;
    source: BugSource;
    message: string;
    stack?: string;
    requestContext?: Record<string, unknown>;
    userContext?: Record<string, unknown>;
    env: string;
    tags?: string[];
    priorityScore: number;
    occurrenceCount: number;
}

export interface BugEventRecord {
    id: number;
    fingerprint: string;
    status: BugStatus;
    severity: BugSeverity;
    source: BugSource;
    message: string;
    stack: string | null;
    requestContext: Record<string, unknown> | null;
    userContext: Record<string, unknown> | null;
    env: string;
    firstSeenAt: string;
    lastSeenAt: string;
    occurrenceCount: number;
    githubIssueNumber: number | null;
    resolutionNotes: string | null;
    fixedCommitSha: string | null;
    resolvedAt: string | null;
    tags: string[] | null;
    priorityScore: number;
}
