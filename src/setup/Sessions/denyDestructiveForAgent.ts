import { NextFunction, Request, Response } from 'express';
import { AGENT_SYSTEM_EMAIL } from './agentTokenAuth';

/**
 * LIS-5 — the registration agent may create and edit, never destroy.
 *
 * WHY THIS EXISTS. The agent token was introduced so that letters could be *registered*
 * without a browser. It was mounted globally (src/index.ts), so it also opened every other
 * route to the same caller — including `DELETE /letter/:id`, which takes its target from the
 * request body and ignores the address entirely. Reproduced on production 2026-07-31:
 * `DELETE /letter/6163` with `{ id: 6164 }` returned 200 and destroyed letter **6164** —
 * database rows and the Drive folder. The role check in agentTokenAuth does not help here:
 * `ENVI_EMPLOYEE` is a perfectly normal role that may delete letters, and the routes only
 * ask whether a session exists.
 *
 * Reconciling the id with the address (resolveRouteLetterId) fixes *which* letter is hit.
 * It does not answer the prior question — whether a headless token should be able to delete
 * a letter at all. This layer answers that one: it should not.
 *
 * SCOPE, DELIBERATELY NARROW.
 * - Applies only to requests carrying the agent identity. A logged-in person is untouched:
 *   deleting letters from the UI works exactly as before.
 * - Refuses by HTTP method. `DELETE` is the whole rule today, which makes it checkable at a
 *   glance and trivial to widen. It does NOT cover destruction expressed as POST/PUT (for
 *   example an attachment-replacement route that drops the previous files) — if such a route
 *   has to be closed for the agent too, add an explicit path rule here rather than sprinkling
 *   session checks across routers.
 * - Provisional: this is a dispatcher decision from 2026-07-31, taken while production was
 *   exposed, and it is reversible. If the owner later decides the agent should delete its own
 *   letters, the narrowing belongs here — for instance by allowing DELETE only for a letter
 *   whose LetterEvents CREATED editor is the agent itself.
 *
 * Responds directly with 403 instead of throwing: this is a policy refusal, not a server
 * fault, and routing it through the global error middleware would report it as a 500 and mail
 * an error report to the team (src/index.ts).
 */

/** The only destructive verb the agent can reach today. Widen here, not in the routers. */
const DENIED_METHODS_FOR_AGENT = new Set(['DELETE']);

export default function denyDestructiveForAgent(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const isAgentRequest =
        req.session?.userData?.systemEmail === AGENT_SYSTEM_EMAIL;
    if (!isAgentRequest) return next();

    if (!DENIED_METHODS_FOR_AGENT.has(req.method.toUpperCase())) return next();

    console.warn(
        `[AgentPolicy] Destructive request refused for the agent identity:: ` +
            `method: ${req.method} path: ${req.path} ip: ${req.ip}`,
    );

    res.status(403).send({
        errorMessage:
            'Konto agenta nie może kasować danych. Skasowanie pisma jest decyzją człowieka — wykonaj ją w aplikacji.',
    });
}
