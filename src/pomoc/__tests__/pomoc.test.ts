import express, { Request } from 'express';
import TaskStore from '../../setup/Sessions/IntersessionsTasksStore';
import { createServer, Server } from 'http';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { readApiPolicy } from '@envi/agent-server';
import { registerPomocRoutes } from '../PomocRouters';
import { pomocDefaults, POMOC_MODEL, createAnthropicClient, canReadPomocTask, askPomoc } from '../service';
import { createUsageStore } from '../store';
import { pomocDataTools } from '../data-tools';
import { parsePomocInput } from '../input';
import { pomocJson, pomocBodyError } from '../body';
import requireSession from '../../setup/Sessions/requireSession';
import projectScopedPolicy from '../../setup/Sessions/projectScopedPolicy';
import ProjectAssignmentRepository from '../../persons/projectAssignments/ProjectAssignmentRepository';
import ContractsController from '../../contracts/ContractsController';
import { SystemRoleName } from '../../types/sessionTypes';
import { AGENT_SYSTEM_EMAIL } from '../../setup/Sessions/agentTokenAuth';

jest.mock('../../index', () => ({ app: require('express')() }));
jest.mock('../../contracts/ContractsController', () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock('../../persons/projectAssignments/ProjectAssignmentRepository', () => ({ __esModule: true, default: { getAssignedProjectOurIds: jest.fn() } }));
jest.mock('../../tools/ToolsDb', () => ({ __esModule: true, default: {} }));
jest.mock('../../setup/Sessions/agentTokenAuth', () => ({ AGENT_SYSTEM_EMAIL: 'konto-techniczne@example.invalid' }));
jest.mock('../../setup/Sessions/ToolsGapi', () => ({ __esModule: true, default: {}, oAuthClient: { on: jest.fn() } }));
jest.mock('../../tools/ToolsGd', () => ({ __esModule: true, default: {} }));
jest.mock('../../tools/ToolsMail', () => ({ __esModule: true, default: {} }));

let codeDir: string;
let server: Server;
let url: string;
let user: any;
const execute = jest.fn();
const create = jest.fn();
const deps = { ...pomocDefaults, env: {} as NodeJS.ProcessEnv, codeDir: '',
    readPolicy: jest.fn(), client: jest.fn(), store: () => createUsageStore({ execute } as any) };
const input = { question: 'Jak dodać sprawę?', screen: { name: 'Sprawy', path: '/tasks' } };
const serverSha = 'abc1234' + 'a'.repeat(33);
const siteSha = 'def5678' + 'b'.repeat(33);
const versionLabel = 'serwer abc1234, ekran def5678';

beforeAll(async () => {
    codeDir = await mkdtemp(join(tmpdir(), 'ps-pomoc-test-'));
    await writeFile(join(codeDir, 'build-info.json'), JSON.stringify({ version: serverSha, hasSite: true, siteVersion: siteSha }));
    deps.codeDir = codeDir;
    const app = express();
    app.use((req, _res, next) => { (req as any).session = { userData: user }; next(); });
    app.use(requireSession, projectScopedPolicy);
    app.use('/pomoc/ask', pomocJson, pomocBodyError);
    app.use(express.json({ limit: '10mb' }));
    registerPomocRoutes(app, deps);
    require('../../setup/Sessions/Gauth2Routers');
    app.use(require('../../index').app);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(codeDir, { recursive: true, force: true });
});
afterEach(() => { for (const id of Object.keys(TaskStore.items)) TaskStore.remove(id); });
beforeEach(() => {
    jest.spyOn(global, 'structuredClone').mockImplementation((value) => JSON.parse(JSON.stringify(value)));
    user = { enviId: 7, systemEmail: 'osoba@example.invalid', userName: 'Osoba', systemRoleName: SystemRoleName.ENVI_EMPLOYEE };
    deps.env = { POMOC_USERS: ' OSOBA@EXAMPLE.INVALID, druga@example.invalid ', POMOC_ANTHROPIC_API_KEY: 'atrapa', POMOC_CANON_TOKEN: 'atrapa-kanonu' };
    const policy = readApiPolicy({ api: { enabled: true, billing_day: 1, monthly_budget_usd: 100,
        kinds: [], users: [], pomoc: { enabled: true, monthly_budget_usd: 100, users: [], daily_questions_per_user: 100 },
        prices_usd_per_mtok: { [POMOC_MODEL]: { input: 3, output: 15, cache_write: 3.75, cache_read: 0.3 } } } });
    deps.readPolicy.mockResolvedValue(policy);
    create.mockReset().mockResolvedValue({ model: POMOC_MODEL, content: [{ type: 'text', text: 'Wybierz Dodaj sprawę.' }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 } });
    deps.client.mockReturnValue({ messages: { create } });
    execute.mockReset().mockImplementation(async (sql: string) => sql.startsWith('SELECT') ? [[], []] : [{ affectedRows: 1 }, []]);
    jest.mocked(ProjectAssignmentRepository.getAssignedProjectOurIds).mockResolvedValue(['P-1']);
    jest.mocked(ContractsController.find).mockResolvedValue([]);
});
async function ask(body: unknown = input, headers = {}) {
    const response = await fetch(`${url}/pomoc/ask`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    if (response.status !== 202) return response;
    const task = await response.json();
    for (let i = 0; i < 100; i++) {
        const status = TaskStore.get(task.taskId);
        if (status?.status === 'done') return { status: 202, json: async () => status.result };
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('Nie ukończono zadania testowego Pomocy.');
}

test('wymaga sesji', async () => {
    user = undefined;
    expect((await ask()).status).toBe(401);
    expect((await fetch(`${url}/pomoc/available`)).status).toBe(401);
    expect(create).not.toHaveBeenCalled();
});
test('odmawia kontu spoza listy', async () => {
    user.systemEmail = 'obca@example.invalid';
    expect((await ask()).status).toBe(403);
    expect(await (await fetch(`${url}/pomoc/available`)).json()).toEqual({ available: false });
    expect(deps.client).not.toHaveBeenCalled();
});
test.each([SystemRoleName.ENVI_EMPLOYEE, SystemRoleName.ENVI_MANAGER])('dopuszcza rolę z POMOC_ROLES bez e-maila na liście: %s', async (role) => {
    deps.env.POMOC_ROLES = ' ENVI_MANAGER, ENVI_EMPLOYEE, ';
    delete deps.env.POMOC_USERS;
    user.systemRoleName = role;
    expect((await (await fetch(`${url}/pomoc/available`)).json()).available).toBe(true);
    expect((await (await ask()).json()).decision).toBe('allowed');
    const writes = execute.mock.calls.filter(([sql]) => sql.startsWith('INSERT'));
    expect(writes[0][1][2]).toBe(user.systemEmail);
});

test.each([SystemRoleName.ENVI_COOPERATOR, SystemRoleName.EXTERNAL_USER, SystemRoleName.CONTRACT_WORKER, SystemRoleName.CLIENT, SystemRoleName.ADMIN, 'envi_employee', '', undefined])('odmawia roli spoza POMOC_ROLES bez e-maila na liście: %s', async (role) => {
    deps.env.POMOC_ROLES = ' ENVI_MANAGER, ENVI_EMPLOYEE, ';
    delete deps.env.POMOC_USERS;
    user.systemRoleName = role;
    expect((await ask()).status).toBe(403);
    expect((await (await fetch(`${url}/pomoc/available`)).json()).available).toBe(false);
    expect(create).not.toHaveBeenCalled();
});

test.each(['envi_employee', 'ENVI_EMPLOYEE_EXTRA'])('POMOC_ROLES porównuje pełne nazwy i wielkość liter: %s', async (roles) => {
    deps.env.POMOC_ROLES = roles;
    delete deps.env.POMOC_USERS;
    expect((await ask()).status).toBe(403);
    expect(create).not.toHaveBeenCalled();
});

test('e-mail z POMOC_USERS daje dostęp bez roli z listy', async () => {
    deps.env.POMOC_ROLES = 'ENVI_MANAGER,ENVI_EMPLOYEE';
    user.systemRoleName = SystemRoleName.ENVI_COOPERATOR;
    expect((await (await ask()).json()).decision).toBe('allowed');
});

test.each(['naglowek', 'naglowek-sb', 'tozsamosc', 'osobisty'])('odmawia agentowi z rolą z listy: %s', async (mode) => {
    deps.env.POMOC_ROLES = 'ENVI_MANAGER,ENVI_EMPLOYEE';
    if (mode === 'tozsamosc') { user.systemEmail = AGENT_SYSTEM_EMAIL; deps.env.POMOC_USERS += `,${AGENT_SYSTEM_EMAIL}`; }
    if (mode === 'osobisty') user.isPersonAgent = true;
    const headers: Record<string, string> = mode === 'naglowek' ? { 'x-envi-agent-token': 'atrapa' } : {};
    if (mode === 'naglowek-sb') headers['x-envi-sb-agent-key'] = 'atrapa';
    expect((await ask(input, headers)).status).toBe(403);
    expect((await (await fetch(`${url}/pomoc/available`, { headers })).json()).available).toBe(false);
    expect(create).not.toHaveBeenCalled();
});
test.each(['POMOC_ANTHROPIC_API_KEY', 'POMOC_CANON_TOKEN'])('bez %s Pomoc jest niedostępna', async (key) => {
    delete deps.env[key];
    expect(await (await fetch(`${url}/pomoc/available`)).json()).toEqual({ available: false });
    expect((await (await ask()).json()).decision).toBe('denied');
    expect(create).not.toHaveBeenCalled();
});
test('wersja kopii musi odpowiadać wdrożeniu', async () => {
    deps.env.SOURCE_VERSION = 'inna-wersja';
    expect(await (await fetch(`${url}/pomoc/available`)).json()).toEqual({ available: false });
});
test('limit 256 kB obejmuje wielobajtowy JSON i historię, również przed parserem 10 MB', async () => {
    expect((await ask({ ...input, history: [{ role: 'user', content: 'ą'.repeat(140000) }] })).status).toBe(413);
    expect(create).not.toHaveBeenCalled();
});
test('złe dane i role historii nie dochodzą do modelu', async () => {
    expect((await ask({ ...input, history: [{ role: 'system', content: 'instrukcja' }] })).status).toBe(400);
    expect((await ask({ ...input, question: 'x'.repeat(8001) })).status).toBe(400);
    expect((await ask({ ...input, markers: [{ id: 'obcy', label: 'Obcy' }] })).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
});
test('przycina historię i stosuje etykiety katalogu serwera', () => {
    const parsed = parsePomocInput({ ...input, history: Array.from({ length: 50 }, () => ({ role: 'user', content: 'x'.repeat(9000) })), markers: [{ id: 'case-add', label: 'Podmieniona' }] });
    expect(parsed.history.reduce((n, m) => n + m.content.length, 0)).toBe(40000);
    expect(parsed.history.every((m) => m.content.length <= 8000)).toBe(true);
    expect(parsed.markers[0].label).toBe('Dodaj sprawę');
});
test('odpowiedź atrapy trafia do klienta, koszt do rzeczywistego adaptera SQL', async () => {
    deps.env.SOURCE_VERSION = serverSha;
    expect(await (await fetch(`${url}/pomoc/available`)).json()).toEqual({ available: true, version: versionLabel });
    const response = await ask();
    expect(response.status).toBe(202);
    const answer = await response.json();
    expect(answer).toMatchObject({ decision: 'allowed', text: 'Wybierz Dodaj sprawę.', based_on: `Na podstawie PS ENVI ${versionLabel}`, cost_usd: 0.0006 });
    expect(answer.conversation).toEqual([{ role: 'user', content: input.question }, { role: 'assistant', content: 'Wybierz Dodaj sprawę.' }]);
    const writes = execute.mock.calls.filter(([sql]) => sql.startsWith('INSERT'));
    expect(writes).toHaveLength(1);
    expect(writes[0][1]).toEqual([expect.any(String), 'HELP', 'osoba@example.invalid', POMOC_MODEL, 'pomoc', expect.any(String), 0.0006]);
});
test('błąd zapisu kosztu nie zwraca udanej odpowiedzi', async () => {
    execute.mockImplementation(async (sql: string) => { if (sql.startsWith('INSERT')) throw new Error('atrapa awarii'); return [[], []]; });
    expect((await (await ask()).json()).decision).toBe('denied');
});
test('błąd kanonu wyłącza model', async () => {
    deps.readPolicy.mockRejectedValue(new Error('atrapa awarii'));
    expect((await (await ask()).json()).decision).toBe('denied');
    expect(create).not.toHaveBeenCalled();
});
test('licznik odtwarza JSON i kwotę oraz pyta o półotwarty przedział UTC', async () => {
    execute.mockResolvedValue([[{ time: '2026-11-01T00:00:00.000000Z', kind: 'HELP', user: 'osoba@example.invalid', model: POMOC_MODEL, bucket: 'pomoc', tokens: '{"input_tokens":100}', cost_usd: '0.5000000000' }], []]);
    const result = await deps.store().list({ start: '2026-11-01T00:00:00Z', end: '2026-12-01T00:00:00Z' });
    expect(result[0]).toMatchObject({ tokens: { input_tokens: 100 }, cost_usd: 0.5 });
    expect(execute.mock.calls[0][0]).toContain('Time >= ? AND Time < ?');
    expect(execute.mock.calls[0][1]).toEqual(['2026-11-01 00:00:00.000', '2026-12-01 00:00:00.000']);
});

test('czas MariaDB z sześcioma cyframi przechodzi rzeczywisty decideStart i nadal liczy limit', async () => {
    execute.mockResolvedValue([[{ time: '2026-11-11T08:20:56.993000Z', kind: 'HELP', user: 'osoba@example.invalid', model: POMOC_MODEL, bucket: 'pomoc', tokens: '{"input_tokens":100}', cost_usd: '0.5000000000' }], []]);
    const store = deps.store();
    const entries = await store.list({ start: '2026-11-01T00:00:00.000Z', end: '2026-12-01T00:00:00.000Z' });
    const policy = await deps.readPolicy();
    policy.pomoc.users = ['osoba@example.invalid'];
    const request = { now: '2026-11-11T09:00:00.000Z', kind: 'HELP', user: 'osoba@example.invalid', model: POMOC_MODEL, bucket: 'pomoc', estimated_cost_usd: 0.5 };
    const { decideStart } = require('@envi/agent-server');
    expect(await decideStart(policy, store, request)).toEqual({ decision: 'allowed' });
    expect(entries[0].time).toBe(new Date(entries[0].time).toISOString());
    expect(entries[0].time).toBe('2026-11-11T08:20:56.993Z');
    policy.pomoc.daily_questions_per_user = 1;
    expect(await decideStart(policy, store, request)).toMatchObject({ decision: 'denied', reason: expect.stringContaining('Dzienny limit') });
});

test('etykieta zachowuje datę master, gdy archiwum nie zawiera SHA', async () => {
    try {
        await writeFile(join(codeDir, 'build-info.json'), JSON.stringify({ version: serverSha, hasSite: true, siteVersion: 'master z 2026-11-11T09:00:00.000Z' }));
        expect(await (await fetch(`${url}/pomoc/available`)).json()).toEqual({ available: true, version: 'serwer abc1234, ekran master z 2026-11-11T09:00:00.000Z' });
    } finally {
        await writeFile(join(codeDir, 'build-info.json'), JSON.stringify({ version: serverSha, hasSite: true, siteVersion: siteSha }));
    }
});

test('prawdziwa trasa wyniku odmawia obcej osobie bez usunięcia zadania, potem autor odbiera wynik', async () => {
    const previousUsers = process.env.POMOC_USERS;
    process.env.POMOC_USERS = deps.env.POMOC_USERS;
    try {
        const answer = await (await ask()).json();
        const taskId = Object.keys(TaskStore.items)[0];
        user = { ...user, enviId: 8, systemEmail: 'druga@example.invalid' };
        const denied = await fetch(`${url}/sessionTaskStatus/${taskId}`);
        expect(denied.status).toBe(403);
        expect(await denied.json()).not.toHaveProperty('result');
        expect(TaskStore.get(taskId)?.result).toEqual(answer);
        user = { ...user, enviId: 7, systemEmail: 'osoba@example.invalid' };
        const accepted = await fetch(`${url}/sessionTaskStatus/${taskId}`);
        expect(accepted.status).toBe(200);
        expect(accepted.headers.get('cache-control')).toBe('no-store');
        const body = await accepted.json();
        expect(body).toMatchObject({ status: 'done', result: answer });
        expect(body).not.toHaveProperty('timeout');
        expect(body).not.toHaveProperty('pomocOwnerId');
        expect(TaskStore.get(taskId)).toBeUndefined();
    } finally {
        if (previousUsers === undefined) delete process.env.POMOC_USERS;
        else process.env.POMOC_USERS = previousUsers;
    }
});
test('dane kontraktu używają tego samego zakresu i funkcji co lista kontraktów', async () => {
    const req = { session: { userData: { ...user, systemRoleName: SystemRoleName.CLIENT } }, projectScope: { projectOurIds: ['P-1'] } } as Request;
    const tools = pomocDataTools(req);
    await tools[1].run({ id: 19 });
    expect(ContractsController.find).toHaveBeenCalledWith([{ id: 19, typesToInclude: 'all' }], req.projectScope);
    expect(await tools[0].run({})).toEqual({ rola: 'CLIENT', projekty: ['P-1'] });
    await expect(tools[1].run({ id: '19' })).rejects.toThrow();
    delete req.projectScope;
    await expect(tools[1].run({ id: 19 })).rejects.toThrow('zakresu');
});
test('rola zakresowa dostaje Pomoc po wyliczeniu swoich projektów', async () => {
    user.systemRoleName = SystemRoleName.CONTRACT_WORKER;
    expect((await (await fetch(`${url}/pomoc/available`)).json()).available).toBe(true);
    expect(ProjectAssignmentRepository.getAssignedProjectOurIds).toHaveBeenCalledWith(7);
});
test('adapter modelu nie ponawia żądania i przekazuje klucz tylko do API', async () => {
    const request = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ content: [] }) });
    await createAnthropicClient('atrapa', request as any).messages.create({ model: POMOC_MODEL });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toMatchObject({ redirect: 'error', headers: { 'x-api-key': 'atrapa' }, signal: expect.any(AbortSignal) });
});

test('formularz z obcej strony nie uruchamia modelu', async () => {
    const response = await fetch(`${url}/pomoc/ask`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'question=pytanie' });
    expect(response.status).toBe(415);
    expect(create).not.toHaveBeenCalled();
});

test('wynik zadania Pomocy jest dostępny tylko autorowi z osobistą sesją', () => {
    const req = { headers: {}, session: { userData: user } } as Request;
    const task = { status: 'done' as const, pomocOwnerId: 7 };
    expect(canReadPomocTask(req, task, deps.env)).toBe(true);
    expect(canReadPomocTask(req, { ...task, pomocOwnerId: 8 }, deps.env)).toBe(false);
    req.headers['x-envi-agent-token'] = 'atrapa';
    expect(canReadPomocTask(req, task, deps.env)).toBe(false);
    expect(canReadPomocTask(req, { status: 'done' }, deps.env)).toBe(true);
    delete req.headers['x-envi-agent-token'];
    user.isPersonAgent = true;
    expect(canReadPomocTask(req, task, deps.env)).toBe(false);
});

test('niepełna sesja bez identyfikatora osoby nie tworzy publicznego zadania', async () => {
    deps.env.POMOC_ROLES = 'ENVI_MANAGER,ENVI_EMPLOYEE';
    delete user.enviId;
    expect((await ask()).status).toBe(403);
    expect(create).not.toHaveBeenCalled();
});

test('równoległe pytanie nie omija wspólnej kontroli budżetu', async () => {
    const req = { headers: {}, session: { userData: user } } as Request;
    const first = askPomoc(req, parsePomocInput(input), [], deps);
    const second = await askPomoc(req, parsePomocInput(input), [], deps);
    expect(second.decision).toBe('denied');
    expect(second.reason).toContain('inne pytanie');
    expect((await first).decision).toBe('allowed');
    expect(create).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls.filter(([sql]) => sql.startsWith('INSERT'))).toHaveLength(1);
});
