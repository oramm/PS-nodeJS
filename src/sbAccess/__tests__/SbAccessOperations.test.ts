import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Operacje modułu dostępu do SB na atrapach: GitHub = podmieniony `fetch` z organizacją
 * w pamięci, Dysk = podmieniony `googleapis`, baza = repozytoria w pamięci. Żadnego
 * prawdziwego wywołania sieciowego ani zapytania do bazy.
 */

// ------------------------------------------------------------------ atrapa Dysku
type Perm = { id: string; emailAddress: string; role: string };
const SB_DRIVE = '0AH3vXVwNH5M-Uk9PVA';
const drive = {
    perms: new Map<string, Perm>(),
    next: 1,
    fail: null as null | { op: string; code: number; message?: string },
    calls: [] as string[],
    params: [] as { op: string; params: any }[],
    options: [] as any[],
    /** Dysk niewidoczny dla konta serwera (zły token / utrata roli organizatora). */
    driveGone: false,
};
function googleError(code: number, message: string) {
    return Object.assign(new Error(message), {
        code,
        status: code,
        errors: [{ reason: 'notFound', message }],
    });
}
/** Każde wywołanie: zapis parametrów, kontrola dysku i supportsAllDrives jak w Google. */
function driveCall(op: string, params: any) {
    drive.calls.push(op);
    drive.params.push({ op, params });
    if (drive.fail?.op === op || drive.fail?.op === '*')
        throw googleError(drive.fail.code, drive.fail.message ?? `Drive ${op} padl`);
    // Bez supportsAllDrives Google nie widzi dysku współdzielonego.
    if (params.fileId !== SB_DRIVE || params.supportsAllDrives !== true || drive.driveGone)
        throw googleError(404, `Shared drive not found: ${params.fileId}`);
}
jest.mock('googleapis', () => ({
    google: {
        drive: (options: any) => {
            drive.options.push(options);
            return {
                permissions: {
                    get: async (params: any) => {
                        driveCall('get', params);
                        const p = drive.perms.get(params.permissionId);
                        if (!p) throw googleError(404, `Permission not found: ${params.permissionId}.`);
                        return { data: p };
                    },
                    list: async (params: any) => {
                        driveCall('list', params);
                        const all = [...drive.perms.values()];
                        const from = Number(params.pageToken ?? 0);
                        const page = all.slice(from, from + params.pageSize);
                        const next = from + params.pageSize;
                        return {
                            data: {
                                permissions: page,
                                nextPageToken: next < all.length ? String(next) : undefined,
                            },
                        };
                    },
                    create: async (params: any) => {
                        driveCall('create', params);
                        const id = `perm${drive.next++}`;
                        drive.perms.set(id, {
                            id,
                            emailAddress: params.requestBody.emailAddress,
                            role: params.requestBody.role,
                        });
                        return { data: { id } };
                    },
                    delete: async (params: any) => {
                        driveCall('delete', params);
                        if (!drive.perms.delete(params.permissionId))
                            throw googleError(404, `Permission not found: ${params.permissionId}.`);
                        return { data: {} };
                    },
                },
            };
        },
    },
}));
jest.mock('../../setup/Sessions/ToolsGapi', () => ({
    oAuthClient: {
        credentials: {},
        setCredentials: () => undefined,
        getAccessToken: async () => ({ token: 'atrapa' }),
    },
}));

import ToolsDb from '../../tools/ToolsDb';
import StaffMemberRepository from '../../staff/StaffMemberRepository';
import SbAccessRepository from '../SbAccessRepository';
import SbAccessEventRepository from '../SbAccessEventRepository';
import SbAccessController from '../SbAccessController';
import { SbAccessError, NOT_CONFIGURED_MESSAGE } from '../sbAccessPolicy';
import { SbAccessRecord, SbAccessStatus } from '../sbAccessTypes';

// ------------------------------------------------------------------ atrapa GitHuba
const gh = {
    members: new Map<string, { role: string }>(),
    invitations: [] as { id: number; email: string | null; login: string | null }[],
    next: 500,
    fail: null as null | { method: string; pattern: RegExp; status: number; body?: any },
    calls: [] as string[],
    authHeaders: [] as string[],
    bodies: [] as any[],
    signals: [] as unknown[],
    /** Zaproszenie znika między listą a anulowaniem (wyścig z przyjęciem). */
    cancelRace: false,
};
function json(status: number, body?: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => (body === undefined ? '' : JSON.stringify(body)),
    };
}
/** Stronicowanie jak w GitHubie: per_page + page (od 1). */
function paged<T>(items: T[], query: URLSearchParams) {
    const perPage = Number(query.get('per_page') ?? 30);
    const page = Number(query.get('page') ?? 1);
    return items.slice((page - 1) * perPage, page * perPage);
}
const fakeFetch = async (url: string, init: any) => {
    const method = init.method;
    const [rawPath, rawQuery] = url.replace('https://api.github.com', '').split('?');
    const path = rawPath;
    const query = new URLSearchParams(rawQuery ?? '');
    gh.calls.push(`${method} ${path}`);
    gh.authHeaders.push(init.headers.Authorization);
    gh.signals.push(init.signal);
    if (init.body) gh.bodies.push(JSON.parse(init.body));
    if (gh.fail && gh.fail.method === method && gh.fail.pattern.test(path))
        return json(gh.fail.status, gh.fail.body ?? { message: 'Awaria atrapy' });
    let m: RegExpMatchArray | null;
    if (path === '/orgs/envi-konsulting/invitations' && method === 'GET')
        return json(200, paged(gh.invitations, query));
    if (path === '/orgs/envi-konsulting/invitations' && method === 'POST') {
        const body = JSON.parse(init.body);
        if (body.role !== 'direct_member' || typeof body.email !== 'string')
            return json(422, { message: 'Validation Failed' });
        const invitation = { id: gh.next++, email: body.email, login: null };
        gh.invitations.push(invitation);
        return json(201, invitation);
    }
    if ((m = path.match(/^\/orgs\/envi-konsulting\/invitations\/(\d+)$/)) && method === 'DELETE') {
        if (gh.cancelRace) gh.invitations = gh.invitations.filter((i) => i.id !== Number(m![1]));
        const before = gh.invitations.length;
        gh.invitations = gh.invitations.filter((i) => i.id !== Number(m![1]));
        return before === gh.invitations.length ? json(404, { message: 'Not Found' }) : json(204);
    }
    if ((m = path.match(/^\/orgs\/envi-konsulting\/memberships\/(.+)$/))) {
        const login = decodeURIComponent(m[1]);
        const key = [...gh.members.keys()].find((k) => k.toLowerCase() === login.toLowerCase());
        if (!key) return json(404, { message: 'Not Found' });
        if (method === 'GET')
            return json(200, { state: 'active', role: gh.members.get(key)!.role, user: { login: key } });
        if (method === 'DELETE') {
            gh.members.delete(key);
            return json(204);
        }
    }
    if (path === '/orgs/envi-konsulting/members' && method === 'GET')
        return json(200, paged([...gh.members.keys()].map((login) => ({ login })), query));
    return json(500, { message: `nieobsluzone ${method} ${path}` });
};
const originalFetch = global.fetch;
afterAll(() => {
    global.fetch = originalFetch;
});

// ------------------------------------------------------------------ baza w pamięci
const db = {
    states: new Map<number, SbAccessRecord>(),
    events: [] as any[],
    accounts: new Map<number, any>(),
};
const TOKEN = 'github_pat_ATRAPA0123456789';
const MANAGER = 125;
const PERSON = 131;
const EMAIL = 'osoba@example.test';

function seed(status: SbAccessStatus | null, extra: Partial<SbAccessRecord> = {}) {
    if (!status) return;
    db.states.set(PERSON, {
        id: 1,
        personId: PERSON,
        statusCode: status,
        githubLogin: null,
        githubInvitationId: null,
        drivePermissionId: null,
        isGrantedManually: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...extra,
    });
}

/** Stan zewnętrzny zgodny z wpisem w rejestrze (to, co moduł by wcześniej nadał). */
function seedExternal(status: SbAccessStatus | null) {
    if (status === 'INVITED') {
        gh.invitations.push({ id: 77, email: EMAIL, login: null });
        drive.perms.set('perm-old', { id: 'perm-old', emailAddress: EMAIL, role: 'reader' });
        seed('INVITED', { githubInvitationId: 77, drivePermissionId: 'perm-old' });
    } else if (status === 'ACTIVE') {
        gh.members.set('Osoba-GH', { role: 'member' });
        drive.perms.set('perm-old', { id: 'perm-old', emailAddress: EMAIL, role: 'reader' });
        seed('ACTIVE', { githubLogin: 'Osoba-GH', githubInvitationId: null, drivePermissionId: 'perm-old' });
    } else if (status) {
        seed(status, { githubLogin: 'Osoba-GH' });
    }
}

beforeEach(() => {
    drive.perms.clear();
    drive.next = 1;
    drive.fail = null;
    drive.calls = [];
    drive.params = [];
    drive.options = [];
    drive.driveGone = false;
    gh.members = new Map([['oramm', { role: 'admin' }]]);
    gh.invitations = [];
    gh.next = 500;
    gh.fail = null;
    gh.calls = [];
    gh.authHeaders = [];
    gh.bodies = [];
    gh.signals = [];
    gh.cancelRace = false;
    db.states.clear();
    db.events = [];
    db.accounts = new Map([
        [PERSON, { personId: PERSON, name: 'Jan', surname: 'Test', systemEmail: EMAIL, isActive: true, systemRoleName: 'ENVI_EMPLOYEE' }],
        [MANAGER, { personId: MANAGER, name: 'Kier', surname: 'Ownik', systemEmail: 'k@example.test', isActive: true, systemRoleName: 'ENVI_MANAGER' }],
        [200, { personId: 200, name: 'Wspol', surname: 'Pracownik', systemEmail: 'w@example.test', isActive: true, systemRoleName: 'ENVI_COOPERATOR' }],
    ]);
    process.env.SB_GITHUB_INVITE_TOKEN = TOKEN;
    process.env.REFRESH_TOKEN = 'atrapa-refresh';
    global.fetch = jest.fn(fakeFetch as any) as any;

    jest.spyOn(ToolsDb, 'transaction').mockImplementation(async (cb: any) => cb({ threadId: 1 }));
    jest.spyOn(SbAccessRepository.prototype, 'getByPersonId').mockImplementation(
        async (personId: number) => (db.states.has(personId) ? { ...db.states.get(personId)! } : null),
    );
    jest.spyOn(SbAccessRepository.prototype, 'getByGithubLogin').mockImplementation(
        async (login: string) =>
            [...db.states.values()].find((s) => s.githubLogin?.toLowerCase() === login.toLowerCase()) ?? null,
    );
    jest.spyOn(SbAccessRepository.prototype, 'getPersonAccount').mockImplementation(
        async (personId: number) => db.accounts.get(personId) ?? null,
    );
    jest.spyOn(SbAccessRepository.prototype, 'list').mockImplementation(async () => [...db.states.values()]);
    jest.spyOn(SbAccessRepository.prototype, 'upsertState').mockImplementation(async (_conn: any, input: any) => {
        const current: any = db.states.get(input.personId) ?? {
            id: db.states.size + 1,
            personId: input.personId,
            githubLogin: null,
            githubInvitationId: null,
            drivePermissionId: null,
            isGrantedManually: false,
        };
        for (const [key, value] of Object.entries(input)) if (value !== undefined) current[key] = value;
        db.states.set(input.personId, current);
    });
    jest.spyOn(SbAccessEventRepository.prototype, 'append').mockImplementation(async (_conn: any, input: any) => {
        db.events.push(input);
    });
    jest.spyOn(StaffMemberRepository, 'hasSbAccessManagement').mockImplementation(
        async (personId: number) => personId === MANAGER,
    );
});

const externalWrites = () =>
    gh.calls.filter((c) => !c.startsWith('GET')).length +
    drive.calls.filter((c) => c === 'create' || c === 'delete').length;

// ------------------------------------------------------------------ macierz stan x operacja
type Op = 'invite' | 'block' | 'unblock' | 'revoke' | 'linkManager' | 'linkSelf';
const STATES: (SbAccessStatus | null)[] = [null, 'INVITED', 'ACTIVE', 'BLOCKED', 'REVOKED'];

function run(op: Op) {
    switch (op) {
        case 'invite': return SbAccessController.invite(PERSON, MANAGER);
        case 'block': return SbAccessController.block(PERSON, MANAGER);
        case 'unblock': return SbAccessController.unblock(PERSON, MANAGER);
        case 'revoke': return SbAccessController.revoke(PERSON, MANAGER);
        case 'linkManager': return SbAccessController.linkGithub(PERSON, 'osoba-gh', MANAGER, 'manager');
        case 'linkSelf': return SbAccessController.linkGithub(PERSON, 'osoba-gh', PERSON, 'self');
    }
}

/** Oczekiwany stan po operacji; 'refuse' = 409 bez skutków. */
const EXPECTED: Record<Op, Record<string, SbAccessStatus | 'refuse'>> = {
    invite: { none: 'INVITED', INVITED: 'INVITED', ACTIVE: 'refuse', BLOCKED: 'refuse', REVOKED: 'ACTIVE' },
    block: { none: 'refuse', INVITED: 'BLOCKED', ACTIVE: 'BLOCKED', BLOCKED: 'BLOCKED', REVOKED: 'refuse' },
    unblock: { none: 'refuse', INVITED: 'refuse', ACTIVE: 'refuse', BLOCKED: 'ACTIVE', REVOKED: 'refuse' },
    revoke: { none: 'refuse', INVITED: 'REVOKED', ACTIVE: 'REVOKED', BLOCKED: 'REVOKED', REVOKED: 'REVOKED' },
    linkManager: { none: 'refuse', INVITED: 'ACTIVE', ACTIVE: 'ACTIVE', BLOCKED: 'BLOCKED', REVOKED: 'REVOKED' },
    linkSelf: { none: 'refuse', INVITED: 'ACTIVE', ACTIVE: 'ACTIVE', BLOCKED: 'refuse', REVOKED: 'refuse' },
};

describe('SbAccessController - każdy stan x każda operacja', () => {
    for (const op of Object.keys(EXPECTED) as Op[]) {
        for (const status of STATES) {
            const expected = EXPECTED[op][status ?? 'none'];
            it(`${op} ze stanu ${status ?? 'brak wpisu'} -> ${expected}`, async () => {
                seedExternal(status);
                // Dla BLOCKED/REVOKED konto jest wciąż członkiem tylko tam, gdzie test tego wymaga.
                if (op.startsWith('link') || (op === 'unblock' && status === 'BLOCKED') || (op === 'invite' && status === 'REVOKED'))
                    gh.members.set('Osoba-GH', { role: 'member' });
                if (op.startsWith('link') && status === 'INVITED') {
                    seed('INVITED', { githubInvitationId: 77 });
                    gh.invitations = []; // przyjęte
                }
                const eventsBefore = db.events.length;
                if (expected === 'refuse') {
                    await expect(run(op)).rejects.toMatchObject({ status: 409 });
                    expect(externalWrites()).toBe(0);
                    expect(db.events.length).toBe(eventsBefore);
                    return;
                }
                const outcome = await run(op);
                expect(outcome.result).toBe('OK');
                expect(db.states.get(PERSON)?.statusCode).toBe(expected);
            });
        }
    }
});

// ------------------------------------------------------------------ scenariusze
describe('SbAccessController - zaproszenie', () => {
    it('nowa osoba: zaproszenie GitHub po adresie z bazy, czytelnik na Dysku, stan INVITED, zdarzenie OK', async () => {
        const outcome = await SbAccessController.invite(PERSON, MANAGER);
        expect(outcome.result).toBe('OK');
        expect(gh.invitations).toEqual([{ id: 500, email: EMAIL, login: null }]);
        expect([...drive.perms.values()]).toEqual([{ id: 'perm1', emailAddress: EMAIL, role: 'reader' }]);
        expect(db.states.get(PERSON)).toMatchObject({ statusCode: 'INVITED', githubInvitationId: 500, drivePermissionId: 'perm1' });
        expect(db.events).toEqual([expect.objectContaining({ personId: PERSON, actionCode: 'INVITE', resultCode: 'OK', requestedByPersonId: MANAGER })]);
        expect(gh.authHeaders.every((h) => h === `Bearer ${TOKEN}`)).toBe(true);
    });

    it('idempotencja: drugie zaproszenie nie dubluje ani zaproszenia GitHub, ani uprawnienia', async () => {
        await SbAccessController.invite(PERSON, MANAGER);
        const second = await SbAccessController.invite(PERSON, MANAGER);
        expect(second.result).toBe('OK');
        expect(gh.invitations).toHaveLength(1);
        expect(drive.perms.size).toBe(1);
        expect(gh.calls.filter((c) => c.startsWith('POST'))).toHaveLength(1);
        expect(drive.calls.filter((c) => c === 'create')).toHaveLength(1);
    });

    it('oczekujące zaproszenie na ten adres sprzed wpisu (np. ręczne) jest przejmowane, nie dublowane', async () => {
        gh.invitations.push({ id: 9, email: EMAIL.toUpperCase(), login: null });
        await SbAccessController.invite(PERSON, MANAGER);
        expect(gh.invitations).toHaveLength(1);
        expect(db.states.get(PERSON)?.githubInvitationId).toBe(9);
    });

    it('uprawnienie nadane poza modułem nie jest zapamiętane - blokada go nie zdejmie, ale powie o nim', async () => {
        drive.perms.set('manual', { id: 'manual', emailAddress: EMAIL, role: 'organizer' });
        const outcome = await SbAccessController.invite(PERSON, MANAGER);
        expect(outcome.result).toBe('OK');
        expect(outcome.note).toContain('poza modułem');
        expect(db.states.get(PERSON)?.drivePermissionId).toBeNull();
        const block = await SbAccessController.block(PERSON, MANAGER);
        expect(drive.perms.has('manual')).toBe(true);
        expect(block.result).toBe('PARTIAL');
        expect(block.note).toContain('zdejmij ręcznie');
    });

    it('czesciowy sukces: GitHub OK, Dysk błąd -> PARTIAL, stan INVITED bez uprawnienia, uwaga widoczna', async () => {
        drive.fail = { op: 'create', code: 403 };
        const outcome = await SbAccessController.invite(PERSON, MANAGER);
        expect(outcome.result).toBe('PARTIAL');
        expect(outcome.note).toMatch(/GitHub: wysłano.*Dysk: błąd/);
        expect(db.states.get(PERSON)).toMatchObject({ statusCode: 'INVITED', githubInvitationId: 500, drivePermissionId: null });
        expect(db.events[0]).toMatchObject({ actionCode: 'INVITE', resultCode: 'PARTIAL' });
        // Powtórka uzupełnia brakującą część, nie dubluje GitHuba.
        drive.fail = null;
        const retry = await SbAccessController.invite(PERSON, MANAGER);
        expect(retry.result).toBe('OK');
        expect(gh.invitations).toHaveLength(1);
        expect(db.states.get(PERSON)?.drivePermissionId).toBe('perm1');
    });

    it('obie części padły -> FAILED, bez wpisu stanu, zdarzenie FAILED', async () => {
        gh.fail = { method: 'POST', pattern: /invitations$/, status: 422 };
        drive.fail = { op: 'create', code: 500 };
        const outcome = await SbAccessController.invite(PERSON, MANAGER);
        expect(outcome.result).toBe('FAILED');
        expect(outcome.state).toBeNull();
        expect(db.states.has(PERSON)).toBe(false);
        expect(db.events).toEqual([expect.objectContaining({ actionCode: 'INVITE', resultCode: 'FAILED' })]);
        expect(outcome.note).toContain('GitHub 422');
    });

    it('odmowa dla roli spoza D2 - bez wywołań zewnętrznych i bez zapisu', async () => {
        await expect(SbAccessController.invite(200, MANAGER)).rejects.toMatchObject({ status: 422 });
        expect(gh.calls).toHaveLength(0);
        expect(drive.calls).toHaveLength(0);
        expect(db.events).toHaveLength(0);
    });

    it('konto techniczne agenta (rola ENVI_EMPLOYEE) nie jest zapraszane ani proponowane', async () => {
        db.accounts.set(PERSON, { ...db.accounts.get(PERSON), systemEmail: 'Agent@ps.envi.com.pl' });
        await expect(SbAccessController.invite(PERSON, MANAGER)).rejects.toMatchObject({ status: 422 });
        jest.spyOn(SbAccessRepository.prototype, 'listInviteCandidates').mockResolvedValue([
            db.accounts.get(PERSON),
            { ...db.accounts.get(PERSON), personId: 7, systemEmail: 'ktos@example.test' },
        ]);
        expect((await SbAccessController.listInviteCandidates()).map((c) => c.personId)).toEqual([7]);
        expect(gh.calls).toHaveLength(0);
    });

    it('odmowa dla konta nieaktywnego albo bez adresu logowania', async () => {
        db.accounts.set(PERSON, { ...db.accounts.get(PERSON), isActive: false });
        await expect(SbAccessController.invite(PERSON, MANAGER)).rejects.toMatchObject({ status: 422 });
        db.accounts.set(PERSON, { ...db.accounts.get(PERSON), isActive: true, systemEmail: null });
        await expect(SbAccessController.invite(PERSON, MANAGER)).rejects.toMatchObject({ status: 422 });
        expect(externalWrites()).toBe(0);
    });

    it('brak tokenu GitHub -> 503 "funkcja nieskonfigurowana", zero wywołań i zero zapisów (także Dysku)', async () => {
        delete process.env.SB_GITHUB_INVITE_TOKEN;
        for (const call of [
            () => SbAccessController.invite(PERSON, MANAGER),
            () => SbAccessController.block(PERSON, MANAGER),
            () => SbAccessController.unblock(PERSON, MANAGER),
            () => SbAccessController.revoke(PERSON, MANAGER),
            () => SbAccessController.linkGithub(PERSON, 'x', MANAGER, 'manager'),
            () => SbAccessController.listUnlinkedGithubMembers(),
        ]) {
            const error = await call().catch((e) => e);
            expect(error).toBeInstanceOf(SbAccessError);
            expect(error).toMatchObject({ status: 503, message: NOT_CONFIGURED_MESSAGE });
        }
        expect(gh.calls).toHaveLength(0);
        expect(drive.calls).toHaveLength(0);
        expect(db.events).toHaveLength(0);
        expect(db.states.size).toBe(0);
    });
});

describe('SbAccessController - blokada, odblokowanie, odebranie', () => {
    it('blokada aktywnego: usuwa członkostwo i tylko uprawnienie modułu; drugi organizator zostaje', async () => {
        seedExternal('ACTIVE');
        drive.perms.set('boss', { id: 'boss', emailAddress: 'szef@example.test', role: 'organizer' });
        const outcome = await SbAccessController.block(PERSON, MANAGER);
        expect(outcome.result).toBe('OK');
        expect(gh.members.has('Osoba-GH')).toBe(false);
        expect([...drive.perms.keys()]).toEqual(['boss']);
        expect(db.states.get(PERSON)).toMatchObject({
            statusCode: 'BLOCKED', githubLogin: 'Osoba-GH', githubInvitationId: null, drivePermissionId: null,
        });
    });

    it('blokada zaproszonego: anuluje oczekujące zaproszenie', async () => {
        seedExternal('INVITED');
        await SbAccessController.block(PERSON, MANAGER);
        expect(gh.invitations).toHaveLength(0);
        expect(drive.perms.size).toBe(0);
    });

    it('idempotencja: powtórna blokada (wszystko już zdjęte, 404) = OK bez błędów', async () => {
        seedExternal('ACTIVE');
        await SbAccessController.block(PERSON, MANAGER);
        const again = await SbAccessController.block(PERSON, MANAGER);
        expect(again.result).toBe('OK');
        expect(db.states.get(PERSON)?.statusCode).toBe('BLOCKED');
    });

    it('404 przy usuwaniu = już usunięte (uprawnienie skasowane ręcznie wcześniej)', async () => {
        seedExternal('ACTIVE');
        drive.perms.delete('perm-old');
        gh.members.delete('Osoba-GH');
        const outcome = await SbAccessController.revoke(PERSON, MANAGER);
        expect(outcome.result).toBe('OK');
        expect(db.states.get(PERSON)?.statusCode).toBe('REVOKED');
    });

    it('zaproszenie przyjęte, konto nieprzypisane -> PARTIAL z prośbą o przypisanie, id zaproszenia zostaje', async () => {
        seed('INVITED', { githubInvitationId: 77, drivePermissionId: 'perm-old' });
        drive.perms.set('perm-old', { id: 'perm-old', emailAddress: EMAIL, role: 'reader' });
        const outcome = await SbAccessController.block(PERSON, MANAGER);
        expect(outcome.result).toBe('PARTIAL');
        expect(outcome.note).toContain('Przypisz konto GitHub');
        expect(db.states.get(PERSON)).toMatchObject({ statusCode: 'BLOCKED', githubInvitationId: 77, drivePermissionId: null });
        // Kierownik przypisuje konto i powtarza blokadę - teraz członkostwo znika.
        gh.members.set('Osoba-GH', { role: 'member' });
        await SbAccessController.linkGithub(PERSON, 'osoba-gh', MANAGER, 'manager');
        const retry = await SbAccessController.block(PERSON, MANAGER);
        expect(retry.result).toBe('OK');
        expect(gh.members.has('Osoba-GH')).toBe(false);
        expect(db.states.get(PERSON)?.githubInvitationId).toBeNull();
    });

    it('częściowy sukces blokady: GitHub OK, Dysk błąd -> PARTIAL, uprawnienie zapamiętane do powtórki', async () => {
        seedExternal('ACTIVE');
        drive.fail = { op: 'delete', code: 500 };
        const outcome = await SbAccessController.block(PERSON, MANAGER);
        expect(outcome.result).toBe('PARTIAL');
        expect(db.states.get(PERSON)).toMatchObject({ statusCode: 'BLOCKED', drivePermissionId: 'perm-old' });
        drive.fail = null;
        expect((await SbAccessController.block(PERSON, MANAGER)).result).toBe('OK');
        expect(drive.perms.size).toBe(0);
    });

    it('blokada, która w całości padła -> FAILED, stan bez zmian', async () => {
        seedExternal('ACTIVE');
        gh.fail = { method: 'GET', pattern: /invitations$/, status: 500 };
        drive.fail = { op: '*', code: 500 };
        const outcome = await SbAccessController.block(PERSON, MANAGER);
        expect(outcome.result).toBe('FAILED');
        expect(db.states.get(PERSON)?.statusCode).toBe('ACTIVE');
        expect(db.events.at(-1)).toMatchObject({ actionCode: 'BLOCK', resultCode: 'FAILED' });
    });

    it('rola zmieniona ręcznie na Dysku (np. organizator) - moduł jej nie zdejmuje', async () => {
        seedExternal('ACTIVE');
        drive.perms.set('perm-old', { id: 'perm-old', emailAddress: EMAIL, role: 'organizer' });
        const outcome = await SbAccessController.block(PERSON, MANAGER);
        expect(outcome.result).toBe('PARTIAL');
        expect(drive.perms.has('perm-old')).toBe(true);
    });

    it('właściciel organizacji GitHub nigdy nie jest usuwany', async () => {
        seed('ACTIVE', { githubLogin: 'oramm' });
        const outcome = await SbAccessController.block(PERSON, MANAGER);
        expect(outcome.result).toBe('PARTIAL');
        expect(gh.members.has('oramm')).toBe(true);
        expect(gh.calls.some((c) => c.startsWith('DELETE'))).toBe(false);
    });

    it('wpis nadany ręcznie: blokada, odebranie i przypisanie odmawiają bez wywołań', async () => {
        seed('ACTIVE', { githubLogin: 'Osoba-GH', isGrantedManually: true });
        await expect(SbAccessController.block(PERSON, MANAGER)).rejects.toMatchObject({ status: 409 });
        await expect(SbAccessController.revoke(PERSON, MANAGER)).rejects.toMatchObject({ status: 409 });
        await expect(SbAccessController.linkGithub(PERSON, 'inny', MANAGER, 'manager')).rejects.toMatchObject({ status: 409 });
        expect(gh.calls).toHaveLength(0);
        expect(drive.calls).toHaveLength(0);
    });

    it('odblokowanie: nowe zaproszenie na adres z bazy i nowy czytelnik, stan INVITED', async () => {
        seedExternal('ACTIVE');
        await SbAccessController.block(PERSON, MANAGER);
        const outcome = await SbAccessController.unblock(PERSON, MANAGER);
        expect(outcome.result).toBe('OK');
        expect(gh.invitations).toEqual([expect.objectContaining({ email: EMAIL })]);
        expect(drive.perms.size).toBe(1);
        expect(db.states.get(PERSON)).toMatchObject({ statusCode: 'INVITED', githubLogin: 'Osoba-GH' });
        // Przed przyjęciem zaproszenia osoba nie przypisze sobie konta.
        gh.members.set('Osoba-GH', { role: 'member' });
        await expect(SbAccessController.linkGithub(PERSON, 'Osoba-GH', PERSON, 'self')).rejects.toMatchObject({ status: 409 });
        // Po przyjęciu zaproszenia to samo konto ponownie = aktywacja.
        gh.invitations = [];
        const relink = await SbAccessController.linkGithub(PERSON, 'Osoba-GH', PERSON, 'self');
        expect(relink.state?.statusCode).toBe('ACTIVE');
        expect(db.events.map((e) => e.actionCode)).toEqual(['BLOCK', 'UNBLOCK', 'ACTIVATE']);
    });

    it('ponowne dopuszczenie po odebraniu = nowe zaproszenie; historia zostaje', async () => {
        seedExternal('ACTIVE');
        await SbAccessController.revoke(PERSON, MANAGER);
        await expect(SbAccessController.unblock(PERSON, MANAGER)).rejects.toMatchObject({ status: 409 });
        const outcome = await SbAccessController.invite(PERSON, MANAGER);
        expect(outcome.state?.statusCode).toBe('INVITED');
        expect(db.events.map((e) => e.actionCode)).toEqual(['REVOKE', 'INVITE']);
    });
});

describe('SbAccessController - przypisanie konta GitHub', () => {
    it('konto spoza organizacji -> 422, bez zapisu', async () => {
        seed('INVITED');
        await expect(SbAccessController.linkGithub(PERSON, 'obcy', PERSON, 'self')).rejects.toMatchObject({ status: 422 });
        expect(db.events).toHaveLength(0);
    });

    it('konto przypisane innej osobie -> 409', async () => {
        seed('INVITED');
        db.states.set(999, { ...db.states.get(PERSON)!, personId: 999, githubLogin: 'Osoba-GH', statusCode: 'ACTIVE' });
        gh.members.set('Osoba-GH', { role: 'member' });
        await expect(SbAccessController.linkGithub(PERSON, 'osoba-gh', MANAGER, 'manager')).rejects.toMatchObject({ status: 409 });
    });

    it('osoba dla siebie nie podmienia już przypisanego innego konta', async () => {
        seed('ACTIVE', { githubLogin: 'Stare' });
        gh.members.set('Nowe', { role: 'member' });
        await expect(SbAccessController.linkGithub(PERSON, 'Nowe', PERSON, 'self')).rejects.toMatchObject({ status: 409 });
    });

    it('aktywacja czyści numer zaproszenia tylko, gdy już nie czeka (kierownik przy czekającym go zostawia)', async () => {
        seed('INVITED', { githubInvitationId: 77 });
        gh.invitations = [{ id: 77, email: EMAIL, login: null }];
        gh.members.set('Osoba-GH', { role: 'member' });
        await SbAccessController.linkGithub(PERSON, 'osoba-gh', MANAGER, 'manager');
        expect(db.states.get(PERSON)).toMatchObject({ statusCode: 'ACTIVE', githubInvitationId: 77 });
        seed('INVITED', { githubInvitationId: 78 });
        db.states.get(PERSON)!.githubLogin = null;
        gh.invitations = [];
        await SbAccessController.linkGithub(PERSON, 'osoba-gh', PERSON, 'self');
        expect(db.states.get(PERSON)).toMatchObject({ statusCode: 'ACTIVE', githubInvitationId: null });
    });

    it('zapisuje login w pisowni z GitHuba i aktywuje zaproszonego (dwa zdarzenia)', async () => {
        seed('INVITED');
        gh.members.set('Osoba-GH', { role: 'member' });
        const outcome = await SbAccessController.linkGithub(PERSON, 'osoba-gh', PERSON, 'self');
        expect(outcome.state).toMatchObject({ statusCode: 'ACTIVE', githubLogin: 'Osoba-GH' });
        expect(db.events.map((e) => [e.actionCode, e.requestedByPersonId])).toEqual([
            ['LINK_GITHUB', PERSON],
            ['ACTIVATE', PERSON],
        ]);
    });

    it('błąd API przy sprawdzaniu -> 502 i zdarzenie FAILED, stan bez zmian', async () => {
        seed('INVITED');
        gh.fail = { method: 'GET', pattern: /memberships/, status: 500 };
        await expect(SbAccessController.linkGithub(PERSON, 'osoba-gh', MANAGER, 'manager')).rejects.toMatchObject({ status: 502 });
        expect(db.events).toEqual([expect.objectContaining({ actionCode: 'LINK_GITHUB', resultCode: 'FAILED' })]);
        expect(db.states.get(PERSON)?.statusCode).toBe('INVITED');
    });

    it('lista członków bez przypisanej osoby pomija przypisanych (bez względu na wielkość liter)', async () => {
        seed('ACTIVE', { githubLogin: 'osoba-gh' });
        gh.members.set('Osoba-GH', { role: 'member' });
        gh.members.set('Ktos', { role: 'member' });
        const unlinked = await SbAccessController.listUnlinkedGithubMembers();
        expect(unlinked.map((u) => u.login).sort()).toEqual(['Ktos', 'oramm']);
    });
});

describe('SbAccessController - bramka i sekrety', () => {
    const ownUser = { enviId: PERSON, systemRoleName: 'ENVI_EMPLOYEE' } as any;

    it.each([
        ['INVITED', true],
        ['ACTIVE', true],
        ['BLOCKED', false],
        ['REVOKED', false],
        [null, false],
    ] as const)('widoczność SB dla stanu %s -> %s', async (status, visible) => {
        seed(status);
        expect(await SbAccessController.canSeeSb(ownUser)).toBe(visible);
        expect(SbAccessRepository.prototype.getByPersonId).toHaveBeenCalledTimes(1);
        expect(SbAccessRepository.prototype.getByPersonId).toHaveBeenCalledWith(PERSON);
    });

    it.each([undefined, null, {}])('bez danych osoby odmawia dostępu: %s', async (user) => {
        expect(await SbAccessController.canSeeSb(user as any)).toBe(false);
        expect(await SbAccessController.getOwnAccess(user as any)).toEqual({
            canManage: false, canSeeSb: false, sb: null,
        });
        expect(SbAccessRepository.prototype.getPersonAccount).not.toHaveBeenCalled();
        expect(SbAccessRepository.prototype.getByPersonId).not.toHaveBeenCalled();
    });

    it.each([false, null])('nieaktywne albo brakujące konto odmawia dostępu: %s', async (active) => {
        seed('INVITED');
        if (active === null) db.accounts.delete(PERSON);
        else db.accounts.get(PERSON).isActive = active;
        expect(await SbAccessController.canSeeSb(ownUser)).toBe(false);
        expect(await SbAccessController.getOwnAccess(ownUser)).toEqual({
            canManage: false, canSeeSb: false, sb: null,
        });
        expect(SbAccessRepository.prototype.getByPersonId).not.toHaveBeenCalled();
    });

    it('kierownik i ADMIN bez wpisu nie widzą SB mimo prawa zarządzania', async () => {
        for (const role of ['ENVI_MANAGER', 'ADMIN']) {
            db.accounts.get(MANAGER).systemRoleName = role;
            const user = { enviId: MANAGER, systemRoleName: role } as any;
            expect(await SbAccessController.canSeeSb(user)).toBe(false);
            expect(await SbAccessController.getOwnAccess(user)).toEqual({
                canManage: true, canSeeSb: false, sb: null,
            });
        }
    });

    it.each(['BLOCKED', 'REVOKED', null] as const)('własny widok ukrywa stan %s', async (status) => {
        seed(status, { githubInvitationId: 77, drivePermissionId: 'tajne', githubLogin: 'Osoba-GH' });
        expect(await SbAccessController.getOwnAccess(ownUser)).toEqual({
            canManage: false, canSeeSb: false, sb: null,
        });
        expect(SbAccessRepository.prototype.getByPersonId).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['INVITED', null, null, false, 'PENDING', 'MISSING'],
        ['INVITED', 'Osoba-GH', 'perm', false, 'PENDING', 'READY'],
        ['ACTIVE', 'Osoba-GH', 'perm', false, 'LINKED', 'READY'],
        ['ACTIVE', null, null, true, 'UNLINKED', 'READY'],
        ['ACTIVE', null, null, false, 'UNLINKED', 'MISSING'],
    ] as const)('własny widok: %s, login %s, Dysk %s, ręczne %s', async (
        status, githubLogin, drivePermissionId, isGrantedManually, githubState, driveState,
    ) => {
        seed(status, { githubLogin, githubInvitationId: 77, drivePermissionId, isGrantedManually });
        expect(await SbAccessController.getOwnAccess(ownUser)).toEqual({
            canManage: false,
            canSeeSb: true,
            sb: { status, githubState, githubLogin, driveState, isGrantedManually },
        });
        expect(SbAccessRepository.prototype.getByPersonId).toHaveBeenCalledTimes(1);
    });

    it('kolejne żądania czytają zmiany wpisu i aktywności konta z bazy', async () => {
        seed('INVITED');
        expect(await SbAccessController.canSeeSb(ownUser)).toBe(true);
        seed('BLOCKED');
        expect(await SbAccessController.canSeeSb(ownUser)).toBe(false);
        seed('ACTIVE');
        expect((await SbAccessController.getOwnAccess(ownUser)).canSeeSb).toBe(true);
        db.accounts.get(PERSON).isActive = false;
        expect(await SbAccessController.getOwnAccess(ownUser)).toEqual({
            canManage: false, canSeeSb: false, sb: null,
        });
    });

    it('zarządza tylko ADMIN/ENVI_MANAGER ze znacznikiem; rola z bazy, nie z sesji', async () => {
        const user = (role: string, enviId: number) => ({ systemRoleName: role, enviId }) as any;
        expect(await SbAccessController.canManage(user('ENVI_MANAGER', MANAGER))).toBe(true);
        // Sesja mówi "pracownik", baza "kierownik" - rozstrzyga baza.
        expect(await SbAccessController.canManage(user('ENVI_EMPLOYEE', MANAGER))).toBe(true);
        db.accounts.set(MANAGER, { ...db.accounts.get(MANAGER), systemRoleName: 'ADMIN' });
        expect(await SbAccessController.canManage(user('ENVI_EMPLOYEE', MANAGER))).toBe(true);
        // Rola odebrana w bazie, sesja wciąż "kierownik" (do 30 dni) -> odmowa.
        db.accounts.set(MANAGER, { ...db.accounts.get(MANAGER), systemRoleName: 'ENVI_EMPLOYEE' });
        expect(await SbAccessController.canManage(user('ENVI_MANAGER', MANAGER))).toBe(false);
        db.accounts.set(MANAGER, { ...db.accounts.get(MANAGER), systemRoleName: 'ENVI_MANAGER', isActive: false });
        expect(await SbAccessController.canManage(user('ENVI_MANAGER', MANAGER))).toBe(false);
        // Bez znacznika (osoba 131 z rolą kierownika w bazie) -> odmowa.
        db.accounts.set(PERSON, { ...db.accounts.get(PERSON), systemRoleName: 'ENVI_MANAGER' });
        expect(await SbAccessController.canManage(user('ENVI_MANAGER', PERSON))).toBe(false);
        expect(await SbAccessController.canManage(undefined)).toBe(false);
    });

    it('żaden zapis w historii nie zawiera tokenu', async () => {
        gh.fail = { method: 'POST', pattern: /invitations$/, status: 401 };
        await SbAccessController.invite(PERSON, MANAGER);
        expect(JSON.stringify(db.events)).not.toContain(TOKEN);
    });
});

describe('SbAccessController - poprawki po przeglądzie', () => {
    it('parametry wywołań: zaproszenie jako member, Dysk: supportsAllDrives, user/reader, SB.ENVI; limity czasu', async () => {
        await SbAccessController.invite(PERSON, MANAGER);
        expect(gh.bodies).toEqual([{ email: EMAIL, role: 'direct_member' }]);
        expect(gh.signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
        const create = drive.params.find((c) => c.op === 'create')!.params;
        expect(create).toMatchObject({
            fileId: SB_DRIVE,
            supportsAllDrives: true,
            requestBody: { type: 'user', role: 'reader', emailAddress: EMAIL },
        });
        expect(drive.params.every((c) => c.params.supportsAllDrives === true && c.params.fileId === SB_DRIVE)).toBe(true);
        expect(drive.options.every((o) => o.version === 'v3' && o.timeout > 0)).toBe(true);
    });

    it('stronicowanie: zaproszenie na 150. pozycji listy GitHub i uprawnienie na 2. stronie Dysku są znajdowane', async () => {
        for (let i = 0; i < 149; i++) gh.invitations.push({ id: 10000 + i, email: `inny${i}@example.test`, login: null });
        gh.invitations.push({ id: 9, email: EMAIL, login: null });
        for (let i = 0; i < 120; i++) drive.perms.set(`x${i}`, { id: `x${i}`, emailAddress: `inny${i}@example.test`, role: 'reader' });
        drive.perms.set('mine', { id: 'mine', emailAddress: EMAIL, role: 'organizer' });
        const outcome = await SbAccessController.invite(PERSON, MANAGER);
        expect(db.states.get(PERSON)?.githubInvitationId).toBe(9);
        expect(gh.calls.filter((c) => c === 'POST /orgs/envi-konsulting/invitations')).toHaveLength(0);
        expect(outcome.note).toContain('poza modułem');
        expect(drive.calls.filter((c) => c === 'list').length).toBeGreaterThan(1);
        expect(drive.calls).not.toContain('create');
    });

    it('stronicowanie członków GitHub: lista bez przypisania obejmuje drugą stronę', async () => {
        for (let i = 0; i < 130; i++) gh.members.set(`czlonek${i}`, { role: 'member' });
        const unlinked = await SbAccessController.listUnlinkedGithubMembers();
        expect(unlinked).toHaveLength(131); // + oramm
    });

    it('(1) odblokowanie, przyjęcie zaproszenia INNYM kontem, blokada -> PARTIAL, zaproszenie zostaje zapamiętane', async () => {
        seedExternal('ACTIVE');
        await SbAccessController.block(PERSON, MANAGER);
        await SbAccessController.unblock(PERSON, MANAGER);
        const invitationId = db.states.get(PERSON)!.githubInvitationId;
        expect(invitationId).toBe(500);
        // Osoba przyjmuje zaproszenie kontem B.
        gh.invitations = [];
        gh.members.set('Konto-B', { role: 'member' });
        const outcome = await SbAccessController.block(PERSON, MANAGER);
        expect(outcome.result).toBe('PARTIAL');
        expect(outcome.note).toContain('Przypisz aktualne konto');
        expect(db.states.get(PERSON)?.githubInvitationId).toBe(invitationId);
        expect(gh.members.has('Konto-B')).toBe(true);
        // Kierownik przypisuje konto B, powtórka blokady usuwa je i czyści zaproszenie.
        await SbAccessController.linkGithub(PERSON, 'konto-b', MANAGER, 'manager');
        const retry = await SbAccessController.block(PERSON, MANAGER);
        expect(retry.result).toBe('OK');
        expect(gh.members.has('Konto-B')).toBe(false);
        expect(db.states.get(PERSON)?.githubInvitationId).toBeNull();
    });

    it('(5c) zaproszenie znika między listą a anulowaniem -> notatka nie mówi "anulowano", a brak konta = PARTIAL', async () => {
        seedExternal('INVITED');
        gh.cancelRace = true;
        const outcome = await SbAccessController.block(PERSON, MANAGER);
        expect(outcome.note).not.toContain('anulowano');
        expect(outcome.note).toContain('zniknęło przed anulowaniem');
        expect(outcome.result).toBe('PARTIAL');
        expect(db.states.get(PERSON)?.githubInvitationId).toBe(77);
    });

    it('(2) 404 całego dysku przy blokadzie = błąd, numer uprawnienia zostaje; brak samego uprawnienia = OK', async () => {
        seedExternal('ACTIVE');
        drive.driveGone = true;
        const outcome = await SbAccessController.block(PERSON, MANAGER);
        expect(outcome.result).toBe('PARTIAL');
        expect(outcome.note).toContain('Shared drive not found');
        expect(db.states.get(PERSON)?.drivePermissionId).toBe('perm-old');
        drive.driveGone = false;
        drive.perms.delete('perm-old');
        const retry = await SbAccessController.block(PERSON, MANAGER);
        expect(retry.result).toBe('OK');
        expect(retry.note).toContain('uprawnienia już nie było');
        expect(db.states.get(PERSON)?.drivePermissionId).toBeNull();
    });

    it('(2) 404 dysku przy usuwaniu (uprawnienie widoczne, delete trafia w niewidoczny dysk) = błąd', async () => {
        seedExternal('ACTIVE');
        drive.fail = { op: 'delete', code: 404, message: 'File not found: 0AH3vXVwNH5M-Uk9PVA.' };
        const outcome = await SbAccessController.block(PERSON, MANAGER);
        expect(outcome.result).toBe('PARTIAL');
        expect(db.states.get(PERSON)?.drivePermissionId).toBe('perm-old');
    });

    it('(3) osoba dla siebie: dopóki jej zaproszenie czeka, przypisania nie ma (bez sprawdzania loginu)', async () => {
        seedExternal('INVITED');
        gh.members.set('Osoba-GH', { role: 'member' });
        await expect(SbAccessController.linkGithub(PERSON, 'osoba-gh', PERSON, 'self')).rejects.toMatchObject({ status: 409 });
        expect(gh.calls.some((c) => c.includes('/memberships/'))).toBe(false);
        // Zaproszenie na jej adres (bez zapamiętanego numeru) też blokuje.
        seed('INVITED');
        gh.invitations = [{ id: 1, email: EMAIL.toUpperCase(), login: null }];
        await expect(SbAccessController.linkGithub(PERSON, 'osoba-gh', PERSON, 'self')).rejects.toMatchObject({ status: 409 });
        expect(db.events).toHaveLength(0);
    });

    it('(3) osoba dla siebie: "nie członek" i "przypisane komuś" dają tę samą odpowiedź', async () => {
        seed('INVITED');
        db.states.set(999, { ...db.states.get(PERSON)!, personId: 999, githubLogin: 'Zajete', statusCode: 'ACTIVE' });
        gh.members.set('Zajete', { role: 'member' });
        const notMember = await SbAccessController.linkGithub(PERSON, 'obcy', PERSON, 'self').catch((e) => e);
        const taken = await SbAccessController.linkGithub(PERSON, 'zajete', PERSON, 'self').catch((e) => e);
        expect(notMember).toBeInstanceOf(SbAccessError);
        expect({ status: notMember.status, message: notMember.message }).toEqual({ status: taken.status, message: taken.message });
        expect(notMember.message).not.toMatch(/obcy|zajete/i);
        // Kierownik dostaje rozróżnienie.
        await expect(SbAccessController.linkGithub(PERSON, 'zajete', MANAGER, 'manager')).rejects.toMatchObject({ status: 409 });
        await expect(SbAccessController.linkGithub(PERSON, 'obcy', MANAGER, 'manager')).rejects.toMatchObject({ status: 422 });
    });

    it('(4) 422 "already a part of this organization" -> czytelna uwaga "przypisz to konto"', async () => {
        gh.fail = {
            method: 'POST',
            pattern: /invitations$/,
            status: 422,
            body: {
                message: 'Validation Failed',
                errors: [{ resource: 'OrganizationInvitation', code: 'unprocessable', field: 'data', message: 'Invitee is already a part of this organization' }],
            },
        };
        const outcome = await SbAccessController.invite(PERSON, MANAGER);
        expect(outcome.result).toBe('PARTIAL');
        expect(outcome.note).toContain('już jest członkiem organizacji - przypisz to konto');
        // Inne 422 zostaje zwykłym błędem z oryginalną treścią.
        db.states.clear();
        drive.perms.clear();
        gh.fail = { method: 'POST', pattern: /invitations$/, status: 422, body: { message: 'Over invitation rate limit' } };
        const other = await SbAccessController.invite(PERSON, MANAGER);
        expect(other.note).toContain('GitHub: błąd - GitHub 422: Over invitation rate limit');
    });
});
