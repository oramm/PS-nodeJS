import { Request } from 'express';
import { BadRequestError } from '../../persons/projectAssignments/ProjectScopeGuard';

/** Run BEFORE global logging/capture/mail, including body-parser and session failures. */
export function sanitizeSoftwareLicenseError(error: unknown, req: Request): unknown {
    if (!/^\/admin\/softwarelicenses?(?:\/|$)/i.test(req.path)) return error;
    req.body = {};
    req.parsedBody = {};
    req.query = {};
    req.parsedQuery = {};
    req.originalUrl = req.path;
    if (error instanceof BadRequestError) return error;
    const safe = new Error('Nie można wykonać operacji na licencjach.');
    // Preserve parser errors as client errors, without copying message/body/cause.
    if (Number.isInteger((error as any)?.status) && (error as any).status >= 400 && (error as any).status < 500)
        Object.assign(safe, { status: (error as any).status });
    return safe;
}
