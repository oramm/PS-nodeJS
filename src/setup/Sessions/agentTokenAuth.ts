import { NextFunction, Request, Response } from 'express';
import { createHash, timingSafeEqual } from 'crypto';
import SystemRoleService from './SystemRoleService';
import { SystemRoleName, UserData } from '../../types/sessionTypes';

/**
 * LIS-2 — headless entry point for the registration agent.
 *
 * The agent gets no new endpoints: it enters through the same routes as the UI, so the
 * side effects (folder, document, shortcut, event) stay identical. The only difference is
 * how the request authenticates — a header instead of a session cookie.
 *
 * Safety rules:
 * - no AGENT_API_TOKEN in env => the layer authenticates nobody, behaviour unchanged,
 * - constant-time token comparison,
 * - a live user session always wins; the token never replaces a logged-in person,
 * - a wrong token behaves exactly like no header at all, so the response never reveals
 *   whether AGENT_API_TOKEN is configured,
 * - the agent identity is resolved by SystemEmail, so no Persons.Id is hardcoded; a missing
 *   Persons row means the layer does not authenticate anyone (fail-closed),
 * - the resolved role must be ENVI_EMPLOYEE; the layer refuses to authenticate an elevated
 *   account, so changing SystemRoleId in the database cannot turn the token into admin access.
 *
 * THE COOKIE IS NOT A CREDENTIAL — read this before touching the logic below.
 * Every request carrying the agent identity is re-checked against the token, and the identity
 * is dropped from the session whenever the token is missing, wrong or rotated. Shortening the
 * cookie lifetime is NOT enough on its own: the shared session config uses `rolling: true`
 * (src/index.ts), so any client polling more often than the expiry keeps refreshing the cookie
 * forever — it would survive a token rotation and, in production, `sameSite: 'none'` makes it
 * usable cross-site. The short maxAge below only stops idle sessions from piling up in Mongo;
 * the re-check on every request is what actually makes rotation effective immediately.
 *
 * ARCHITECTURE: depends on SystemRoleService, not on PersonsController — same reason as
 * ToolsGapi (see SystemRoleService header comment): infrastructure must not import the
 * application layer, otherwise the dependency cycle comes back.
 */

const AGENT_TOKEN_HEADER = 'x-envi-agent-token';

/** Technical account created for G-LIS-1. Stable across environments, unlike Persons.Id.
 *  Exported so that policy layers can recognise an agent-authenticated request without
 *  importing the application layer or hardcoding the address a second time. */
export const AGENT_SYSTEM_EMAIL = 'agent@ps.envi.com.pl';

/** Display name used in session logs and bug-event user context. */
const AGENT_USER_NAME = 'Agent automatyczny';

/** The only role the agent may enter with (G-LIS-1). Anything wider is refused. */
const AGENT_ALLOWED_ROLE = SystemRoleName.ENVI_EMPLOYEE;

/** Keeps idle agent sessions from accumulating in Mongo. Not a security boundary. */
const AGENT_SESSION_MAX_AGE_MS = 60 * 1000;

/**
 * Values that mean "somebody stringified a missing variable", not "here is a secret".
 * Without this, `AGENT_API_TOKEN=undefined` is a working and trivially guessable credential.
 */
const INVALID_TOKEN_LITERALS = new Set(['undefined', 'null']);

/** Below this length the token is still accepted, but the operator gets a warning. */
const WEAK_TOKEN_LENGTH = 32;

/**
 * The identity is cached, but only briefly: the database stays the source of truth, so a
 * revoked or downgraded agent account takes effect without restarting the process. The
 * negative result is cached too — otherwise a missing account would mean a database
 * round-trip plus a log line on every request, and the extra latency would let a caller
 * tell a valid token from an invalid one despite identical responses.
 */
const AGENT_CACHE_TTL_MS = 5 * 60 * 1000;

let cachedAgentUserData: UserData | undefined;
let cachedAgentUserDataAtMs = 0;

/**
 * Reads the configured token. Env is read per request on purpose: the module is imported
 * before loadEnv() runs, so reading at import time would capture an empty value.
 */
function readConfiguredToken(): string | undefined {
    const trimmed = (process.env.AGENT_API_TOKEN || '').trim();
    if (!trimmed) return undefined;
    if (INVALID_TOKEN_LITERALS.has(trimmed.toLowerCase())) return undefined;
    return trimmed;
}

/**
 * Startup diagnostics. Called from src/index.ts after the server binds, which is the first
 * moment env is guaranteed to be loaded. Never changes behaviour — it only makes a
 * misconfigured token loud instead of silently inactive.
 */
export function reportAgentTokenConfig(): void {
    const raw = process.env.AGENT_API_TOKEN;

    if (raw === undefined) {
        console.log(
            '[AgentAuth] AGENT_API_TOKEN not set — headless agent entry is disabled.',
        );
        return;
    }

    const trimmed = raw.trim();

    if (!trimmed) {
        console.error(
            '[AgentAuth] AGENT_API_TOKEN is set but empty (or whitespace only) — headless agent entry is DISABLED. Set a real value or remove the variable.',
        );
        return;
    }

    if (INVALID_TOKEN_LITERALS.has(trimmed.toLowerCase())) {
        console.error(
            `[AgentAuth] AGENT_API_TOKEN has the literal value "${trimmed}" — this is a stringified missing variable, not a secret. Headless agent entry is DISABLED.`,
        );
        return;
    }

    if (trimmed.length < WEAK_TOKEN_LENGTH) {
        console.warn(
            `[AgentAuth] AGENT_API_TOKEN is shorter than ${WEAK_TOKEN_LENGTH} characters — agent entry stays ENABLED, but the token is weak. Use a random value, e.g. 32 bytes hex.`,
        );
    }

    console.log('[AgentAuth] AGENT_API_TOKEN configured — agent entry enabled.');
}

/**
 * Constant-time comparison. Hashing first equalises buffer lengths — timingSafeEqual throws
 * on different lengths. Same pattern as isMatchingClientErrorSecret in src/index.ts.
 */
function isMatchingAgentToken(
    expectedToken: string,
    providedToken: string,
): boolean {
    const expectedBuffer = createHash('sha256')
        .update(expectedToken, 'utf8')
        .digest();
    const providedBuffer = createHash('sha256')
        .update(providedToken, 'utf8')
        .digest();

    return timingSafeEqual(expectedBuffer, providedBuffer);
}

async function resolveAgentUserData(): Promise<UserData | undefined> {
    const isCacheFresh =
        Date.now() - cachedAgentUserDataAtMs < AGENT_CACHE_TTL_MS;
    if (isCacheFresh) return cachedAgentUserData;

    const systemRole = await SystemRoleService.getSystemRole({
        systemEmail: AGENT_SYSTEM_EMAIL,
    });

    cachedAgentUserDataAtMs = Date.now();

    if (!systemRole) {
        console.warn(
            `[AgentAuth] No agent account (${AGENT_SYSTEM_EMAIL}) in Persons — agent entry rejected. ` +
                `This decision is cached for ${AGENT_CACHE_TTL_MS / 1000}s: after creating the account, ` +
                `the next attempt can still be refused until the cache expires.`,
        );
        cachedAgentUserData = undefined;
        return undefined;
    }

    if (systemRole.name !== AGENT_ALLOWED_ROLE) {
        console.warn(
            `[AgentAuth] Agent account has role ${systemRole.name}, expected ${AGENT_ALLOWED_ROLE} — agent entry rejected. ` +
                `This decision is cached for ${AGENT_CACHE_TTL_MS / 1000}s: after fixing the role, ` +
                `the next attempt can still be refused until the cache expires.`,
        );
        cachedAgentUserData = undefined;
        return undefined;
    }

    cachedAgentUserData = {
        enviId: systemRole.personId,
        systemEmail: AGENT_SYSTEM_EMAIL,
        userName: AGENT_USER_NAME,
        picture: '',
        systemRoleName: <SystemRoleName>systemRole.name,
        systemRoleId: systemRole.id,
    };

    return cachedAgentUserData;
}

export default async function agentTokenAuth(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const expectedToken = readConfiguredToken();
        const providedToken = String(
            req.headers[AGENT_TOKEN_HEADER] || '',
        ).trim();

        const hasValidToken =
            Boolean(expectedToken) &&
            providedToken.length > 0 &&
            isMatchingAgentToken(<string>expectedToken, providedToken);

        const sessionHoldsAgentIdentity =
            req.session.userData?.systemEmail === AGENT_SYSTEM_EMAIL;

        // The agent identity must be re-earned on every single request. This is what makes a
        // token rotation take effect immediately: the old cookie stops working on its next
        // use instead of being refreshed forever by `rolling: true`. Runs before the
        // "layer inactive" checks on purpose — removing AGENT_API_TOKEN must also revoke
        // the sessions it handed out earlier.
        if (sessionHoldsAgentIdentity && !hasValidToken) {
            delete (<any>req.session).userData;
            console.warn(
                `[AgentAuth] Agent session presented without a valid token — identity dropped:: path: ${req.path} ip: ${req.ip}`,
            );
            return next();
        }

        if (!expectedToken) return next();
        if (!providedToken) return next();

        // A live human session is never overwritten — see LIS-2 task 1.
        if (req.session.userData) return next();

        if (!hasValidToken) {
            // The caller still gets the plain "not logged in" path (no information leak),
            // but the attempt must leave a trace on the server side. IP only — never the token.
            console.warn(
                `[AgentAuth] Invalid agent token:: path: ${req.path} ip: ${req.ip}`,
            );
            return next();
        }

        const agentUserData = await resolveAgentUserData();
        if (!agentUserData) return next();

        // Shallow copy: the cached identity is shared between requests and must not be
        // mutated through a session object.
        req.session.userData = { ...agentUserData };
        req.session.cookie.maxAge = AGENT_SESSION_MAX_AGE_MS;
        console.log(
            `[AgentAuth] Agent token accepted:: ID: ${req.sessionID} path: ${req.path} userName: ${agentUserData.userName} / ${agentUserData.systemRoleName} / enviId: ${agentUserData.enviId}`,
        );
        next();
    } catch (error) {
        // The layer must never break a request it does not authenticate.
        console.error('[AgentAuth] Agent token layer failed:', error);
        next();
    }
}
