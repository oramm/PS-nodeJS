import './agent-server-types';
import { readFile } from 'fs/promises';
import { resolve, join } from 'path';
import type { Request } from 'express';
import { readApiPolicy, readCanonFile, ApiConfig, UsageStore } from '@envi/agent-server';
import { runPomoc, ModelClient, PomocResult, DataTool } from '@envi/agent-server/pomoc';
import { PomocInput } from './input';
import { SessionTask } from '../types/sessionTypes';
import { pomocUsageStore } from './store';
import { AGENT_SYSTEM_EMAIL } from '../setup/Sessions/agentTokenAuth';

export const POMOC_MODEL = 'claude-sonnet-5-5';
export const POMOC_EFFORT = 'medium';

export function createAnthropicClient(key: string, request: typeof fetch = fetch): ModelClient {
    // Cały przebieg kończy się przed pięciominutową retencją TaskStore.
    const deadline = AbortSignal.timeout(240000);
    return { messages: { async create(input) {
        const response = await request('https://api.anthropic.com/v1/messages', {
            method: 'POST', redirect: 'error', signal: AbortSignal.any([deadline, AbortSignal.timeout(60000)]),
            headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify(input),
        });
        if (!response.ok) throw new Error('Nie udało się uzyskać odpowiedzi modelu.');
        return response.json();
    } } };
}

export interface PomocDependencies {
    env: NodeJS.ProcessEnv;
    codeDir: string;
    readPolicy(token: string): Promise<ApiConfig>;
    client(key: string): ModelClient;
    store(): UsageStore;
}
export const pomocDefaults: PomocDependencies = {
    env: process.env,
    codeDir: resolve('.pomoc-src'),
    readPolicy: async (token) => readApiPolicy(await readCanonFile({ token,
        path: '40_wiki/firma/technologie/agent-model-effort-policy.md',
        fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(4000) }),
    })),
    client: createAnthropicClient,
    store: pomocUsageStore,
};

export function pomocIdentity(req: Request, env = process.env): string | undefined {
    const user = req.session?.userData;
    const email = user?.systemEmail?.trim().toLowerCase();
    if (!user || !Number.isSafeInteger(user.enviId) || user.enviId <= 0 || user.isPersonAgent || req.headers['x-envi-agent-token'] !== undefined || req.headers['x-envi-sb-agent-key'] !== undefined || email === AGENT_SYSTEM_EMAIL) return;
    const users = (env.POMOC_USERS ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
    const roles = (env.POMOC_ROLES ?? '').split(',').map((value) => value.trim()).filter(Boolean);
    return email && (roles.includes(user.systemRoleName) || users.includes(email)) ? email : undefined;
}

export function canReadPomocTask(req: Request, task: SessionTask, env = process.env): boolean {
    return task.pomocOwnerId === undefined ||
        (!!pomocIdentity(req, env) && req.session?.userData?.enviId === task.pomocOwnerId);
}

export async function pomocAccess(req: Request, deps = pomocDefaults) {
    const email = pomocIdentity(req, deps.env);
    const key = deps.env.POMOC_ANTHROPIC_API_KEY?.trim();
    const token = deps.env.POMOC_CANON_TOKEN?.trim();
    if (!email || !key || !token) return;
    try {
        const info = JSON.parse(await readFile(join(deps.codeDir, 'build-info.json'), 'utf8'));
        const deployed = deps.env.HEROKU_SLUG_COMMIT || deps.env.SOURCE_VERSION;
        if (typeof info.version !== 'string' || !info.version.trim() || (deployed && info.version !== deployed)) return;
        const siteVersion = /^[a-f0-9]{40}$/i.test(info.siteVersion) ? info.siteVersion.slice(0, 7) : info.siteVersion || 'brak kopii';
        return { email, key, token, version: `serwer ${info.version.slice(0, 7)}, ekran ${siteVersion}` };
    } catch { return; }
}

// Jedna kontrola budżetu, przebieg i zapis kosztu naraz w procesie.
let busy = false;
export async function askPomoc(req: Request, input: PomocInput, dataTools: DataTool[], deps = pomocDefaults): Promise<PomocResult> {
    const denied = (reason: string): PomocResult => ({ decision: 'denied', reason, text: '', markers: [], ticket_draft: null, cost_usd: 0, conversation: input.history });
    if (busy) return denied('Pomoc odpowiada na inne pytanie. Spróbuj za chwilę.');
    busy = true;
    try {
        const access = await pomocAccess(req, deps);
        if (!access) return denied('Pomoc jest niedostępna dla tego konta lub nie została skonfigurowana.');
        const policy = await deps.readPolicy(access.token);
        const config = { ...policy, pomoc: { ...policy.pomoc!, users: [access.email] } };
        return await runPomoc({ ...input, client: deps.client(access.key), config, store: deps.store(),
            user: access.email, model: POMOC_MODEL, effort: POMOC_EFFORT, system_name: 'PS ENVI',
            system_version: access.version, code_dir: deps.codeDir, data_tools: dataTools,
            max_turns: 12, max_tokens: 8000, estimated_cost_per_call_usd: 0.5 });
    } catch {
        // Szczegóły mogą zawierać klucze, politykę lub dane rozmowy.
        console.error('[pomoc] Nie udało się odczytać polityki, uzyskać odpowiedzi lub zapisać kosztu.');
        return denied('Nie udało się uzyskać odpowiedzi Pomocy lub zapisać kosztu. Spróbuj ponownie później.');
    } finally { busy = false; }
}
