import { Request } from 'express';

/** Przed globalnym logiem i raportem: także błędy parsera mogą zawierać szyfrogram. */
export function sanitizeSbSecretError(error: unknown, req: Request): unknown {
    if (!/^\/sbAccess\/[^/]+\/secrets(?:\/|$)/i.test(req.path)) return error;
    req.body = {};
    req.parsedBody = {};
    req.query = {};
    req.parsedQuery = {};
    req.originalUrl = req.path;
    const safe = new Error('Nie można wykonać operacji na hasłach SB.');
    const status = (error as any)?.status;
    if (Number.isInteger(status) && status >= 400 && status < 500) Object.assign(safe, { status });
    return safe;
}
