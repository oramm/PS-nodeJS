import { createHash } from 'crypto';

function normalizeMessage(message: string): string {
    return message
        .toLowerCase()
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '<uuid>')
        .replace(/\b\d{4}-\d{2}-\d{2}(?:[ t]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)?\b/g, '<date>')
        .replace(/\b\d+\b/g, '<num>')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeStack(stack?: string): string {
    if (!stack) return '';

    const normalizedLines = stack
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) =>
            line
                .replace(/:\d+:\d+/g, '')
                .replace(/:\d+/g, '')
                .replace(/\b\d+\b/g, '<num>')
        );

    return normalizedLines.join('\n');
}

export function resolveError(error: unknown): Error {
    if (error instanceof Error) return error;

    if (typeof error === 'string') {
        return new Error(error);
    }

    try {
        return new Error(JSON.stringify(error));
    } catch (_err) {
        return new Error('Unknown non-serializable error');
    }
}

export function buildBugFingerprint(error: unknown): {
    fingerprint: string;
    normalizedMessage: string;
    normalizedStack: string;
    rawMessage: string;
    rawStack?: string;
} {
    const resolvedError = resolveError(error);
    const rawMessage = resolvedError.message || resolvedError.name || 'Unknown error';
    const rawStack = resolvedError.stack;

    const normalizedMessage = normalizeMessage(rawMessage);
    const normalizedStack = normalizeStack(rawStack);

    const fingerprintInput = `${resolvedError.name}|${normalizedMessage}|${normalizedStack}`;
    const fingerprint = createHash('sha256').update(fingerprintInput).digest('hex');

    return {
        fingerprint,
        normalizedMessage,
        normalizedStack,
        rawMessage,
        rawStack,
    };
}
