import { BugSeverity, BugSource } from './BugEvent';

function sanitizeOccurrenceCount(occurrenceCount: number): number {
    if (!Number.isFinite(occurrenceCount) || occurrenceCount < 1) return 1;
    return Math.floor(occurrenceCount);
}

export function resolveSeverity(params: {
    source: BugSource;
    env: string;
    message: string;
}): BugSeverity {
    const env = params.env.toLowerCase();
    const message = params.message.toLowerCase();

    if (
        params.source === 'process_uncaught_exception' ||
        params.source === 'process_unhandled_rejection'
    ) {
        return 'critical';
    }

    if (env === 'production' && /database|timeout|connection refused|out of memory|ENOMEM/i.test(message)) {
        return 'critical';
    }

    if (env === 'production') return 'high';
    if (params.source === 'frontend') return 'medium';

    return 'low';
}

export function calculatePriorityScore(params: {
    occurrenceCount: number;
    env: string;
    source: BugSource;
    severity: BugSeverity;
    requestContext?: Record<string, unknown>;
}): number {
    const occurrenceCount = sanitizeOccurrenceCount(params.occurrenceCount);

    const occurrenceWeight = Math.min(40, Math.log2(occurrenceCount + 1) * 10);
    const envWeight = params.env.toLowerCase() === 'production' ? 30 : 10;

    const sourceWeight =
        params.source === 'process_uncaught_exception' ||
        params.source === 'process_unhandled_rejection'
            ? 20
            : params.source === 'express_error_middleware'
              ? 10
              : 5;

    const severityWeight =
        params.severity === 'critical'
            ? 30
            : params.severity === 'high'
              ? 20
              : params.severity === 'medium'
                ? 10
                : 5;

    const statusCode = Number(params.requestContext?.statusCode || 0);
    const userImpactWeight = statusCode >= 500 ? 15 : statusCode >= 400 ? 8 : 0;

    return Math.round(
        occurrenceWeight + envWeight + sourceWeight + severityWeight + userImpactWeight
    );
}
