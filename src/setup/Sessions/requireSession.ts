import { NextFunction, Request, Response } from 'express';

/**
 * Global "there must be a session" gate.
 *
 * WHY THIS EXISTS. Authorisation in this application is, in practice, the single question
 * "is there a session" — a role check appears in five places in the whole repository, all of
 * them in ScrumboardRouters. That question was asked route by route, by hand, in ~300 routes,
 * so it was asked inconsistently. Two routes with irreversible or external effects turned out
 * to ask it nowhere at all: `POST /invoice/:id/ksef/send` (submits an invoice to the tax
 * authority) and `PUT /deleteOfferBond/:id` (drops a bid bond, destruction expressed as PUT,
 * therefore outside any rule keyed on the HTTP method). `POST /get-token` handed the
 * application's own Google access token to anonymous callers. Found 2026-07-31 while asking
 * what the headless agent token reaches; see the PS.APP.01 pack.
 *
 * The gate turns the default around: every route needs a session unless it is on the list
 * below. Per-route checks stay where they are — they are now a second, redundant line, not
 * the only one.
 *
 * WHAT THIS IS NOT. It is authentication, not authorisation. Every logged-in person still
 * reaches every route, exactly as before; the agent identity is narrowed separately by
 * denyDestructiveForAgent. Restricting *who* may do *what* is a different, larger job.
 *
 * MOUNTING. Must sit after session(), after agentTokenAuth (which is what grants the agent a
 * session in the first place) and before every route, including the ones registered inline in
 * index.ts. Refuses with 401 directly instead of throwing: an unauthenticated call is a client
 * error, and routing it through the global error middleware would report it as a 500 and mail
 * an error report to the team (src/index.ts).
 */

/**
 * The complete list of routes reachable without a session. Anything not listed needs one.
 *
 * Paths are matched the way Express itself matches them by default: case-insensitively and
 * ignoring a trailing slash. Adding an entry here opens a route to the whole internet — the
 * comment on each one says who calls it and what guards it instead.
 */
const PUBLIC_ROUTES: { method: string; path: string }[] = [
    // Sign-in and sign-out. /session is the client's "am I still logged in" probe and answers
    // 401 on its own.
    { method: 'POST', path: '/login' },
    { method: 'POST', path: '/logout' },
    { method: 'GET', path: '/session' },
    // Google's redirect target after the user grants access.
    { method: 'GET', path: '/oauthcallback' },
    // Front-end crash reports: sent precisely when the client is broken, possibly before or
    // after a session exists. Guarded by its own shared secret (precheckClientErrorRequest).
    { method: 'POST', path: '/client-error' },
];

/**
 * Prefix opened for everyone by design: the profile-update form filled in by people outside
 * the company. Authorisation there is the one-time token in the URL plus an e-mail
 * verification code (PublicProfileSubmissionController), not a session.
 */
const PUBLIC_PREFIXES = ['/v2/public/'];

/** Mirrors Express's default routing: case-insensitive, trailing slash ignored. */
function normalizePath(path: string): string {
    const lower = path.toLowerCase();
    return lower.length > 1 ? lower.replace(/\/+$/, '') : lower;
}

function isPublic(method: string, path: string): boolean {
    const normalized = normalizePath(path);
    if (PUBLIC_PREFIXES.some((prefix) => normalized.startsWith(prefix)))
        return true;
    return PUBLIC_ROUTES.some(
        (route) =>
            route.method === method.toUpperCase() &&
            normalizePath(route.path) === normalized,
    );
}

export default function requireSession(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    if (req.session?.userData) return next();
    if (isPublic(req.method, req.path)) return next();

    // Loud on purpose. If a caller nobody knew about was reaching the API without a session —
    // a scheduled job, an integration, a bookmarked maintenance URL — this line is where it
    // shows up after deployment, instead of failing silently.
    console.warn(
        `[RequireSession] Anonymous request refused:: method: ${req.method} path: ${req.path} ip: ${req.ip}`,
    );

    res.status(401).send({ errorMessage: 'Użytkownik niezalogowany' });
}
