import { NextFunction, Request, Response } from 'express';
import { SystemRoleName, UserData } from '../types/sessionTypes';
import SbAccessRepository from './SbAccessRepository';
import { SB_AGENT_KEY_HEADER, deviceTokenHash } from './sbSecretsPolicy';

/**
 * SBZ-1 — agent pracownika wchodzi do PS osobistym kluczem (nagłówek x-envi-sb-agent-key).
 *
 * Wzorzec jak agentTokenAuth (src/setup/Sessions/agentTokenAuth.ts): te same trasy co UI,
 * inne jest tylko poświadczenie. Różnica: tożsamością jest OSOBA, do której należy klucz,
 * ze znakiem isPersonAgent — historia pokazuje pracownika, a denyDestructiveForAgent
 * zawęża, co agent może.
 *
 * Reguły:
 * - klucz działa tylko przy wpisie SB ACTIVE i aktywnym koncie PS (inaczej jak bez nagłówka:
 *   401 z requireSession) oraz poziomie "baza PS: zapis" (inaczej 403 wprost); sprawdzane
 *   w bazie przy KAŻDYM żądaniu, bez pamięci podręcznej, więc blokada albo zmiana poziomu
 *   działa od razu. Blokada i odebranie kasują też skrót klucza (SbAccessRepository),
 * - sesja agenta osoby bez ważnego klucza traci tożsamość (ciasteczko nie jest poświadczeniem,
 *   powód w agentTokenAuth: `rolling: true` odświeża je w nieskończoność),
 * - żywa sesja człowieka nigdy nie jest nadpisywana,
 * - zły klucz = zachowanie jak bez nagłówka (requireSession odpowie 401), ślad tylko w logu.
 */

const AGENT_SESSION_MAX_AGE_MS = 60 * 1000;
const repository = new SbAccessRepository();

async function resolve(rawKey: unknown): Promise<UserData | 'READ_ONLY' | undefined> {
    const hash = deviceTokenHash(rawKey);
    if (!hash) return undefined;
    const agent = await repository.getAgentByKeyHash(hash);
    if (!agent) return undefined;
    if (agent.psDb !== 'rw') return 'READ_ONLY';
    return {
        enviId: agent.personId,
        systemEmail: agent.systemEmail,
        userName: `${agent.name} ${agent.surname} (agent)`,
        picture: '',
        systemRoleName: <SystemRoleName>agent.systemRoleName,
        systemRoleId: agent.systemRoleId,
        isPersonAgent: true,
    };
}

export default async function sbAgentKeyAuth(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const rawKey = req.headers[SB_AGENT_KEY_HEADER];
        const sessionUser = req.session.userData;
        // Człowiek zalogowany w przeglądarce (albo agent właściciela) — warstwa nic nie robi.
        if (sessionUser && !sessionUser.isPersonAgent) return next();
        if (!sessionUser && !rawKey) return next();

        const agentUser = rawKey ? await resolve(String(rawKey).trim()) : undefined;
        if (agentUser === 'READ_ONLY') {
            if (sessionUser) delete (<any>req.session).userData;
            res.status(403).send({
                errorMessage:
                    'Agent tej osoby nie ma prawa zapisu w PS (Dostępy SB: "baza PS" inna niż zapis).',
            });
            return;
        }
        if (!agentUser) {
            if (sessionUser) delete (<any>req.session).userData;
            console.warn(
                `[SbAgentKey] Agent key missing, invalid or not allowed (ACTIVE + baza PS: zapis):: path: ${req.path} ip: ${req.ip}`,
            );
            return next();
        }

        req.session.userData = agentUser;
        res.locals.authenticatedMachine = true;
        req.session.cookie.maxAge = AGENT_SESSION_MAX_AGE_MS;
        next();
    } catch (error) {
        // Awaria warstwy nie może przepuścić tożsamości: bez niej requireSession odpowie 401.
        console.error('[SbAgentKey] Agent key layer failed:', error);
        if (req.session.userData?.isPersonAgent) delete (<any>req.session).userData;
        next();
    }
}
