import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Operacje modułu dostępu do SB na atrapach: GitHub = podmieniony `fetch` z organizacją
 * w pamięci, Dysk = podmieniony `googleapis`, baza = repozytoria w pamięci. Żadnego
 * prawdziwego wywołania sieciowego ani zapytania do bazy.
 */

// ------------------------------------------------------------------ atrapa Dysku
type Perm = { id: string; emailAddress: string; role: string };
const drive = {
    perms: new Map<string, Perm>(),
    next: 1,
    fail: null as null | { op: string; code: number },
    calls: [] as string[],
};
function driveFail(op: string) {
    drive.calls.push(op);
    if (drive.fail?.op === op || drive.fail?.op === '*')
        throw Object.assign(new Error(`Drive ${op} padl`), { code: drive.fail.code });
}
jest.mock('googleapis', () => ({
    google: {
        drive: () => ({
            permissions: {
                get: async ({ permissionId }: any) => {
                    driveFail('get');
                    const p = drive.perms.get(permissionId);
                    if (!p) throw Object.assign(new Error('not found'), { code: 404 });
                    return { data: p };
                },
                list: async () => {
                    driveFail('list');
                    return { data: { permissions: [...drive.perms.values()] } };
                },
                create: async ({ requestBody }: any) => {
                    driveFail('create');
                    const id = `perm${drive.next++}`;
                    drive.perms.set(id, {
                        id,
                        emailAddress: requestBody.emailAddress,
                        role: requestBody.role,
                    });
                    return { data: { id } };
                },
                delete: async ({ permissionId }: any) => {
                    driveFail('delete');
                    if (!drive.perms.delete(permissionId))
                        throw Object.assign(new Error('not found'), { code: 404 });
                    return { data: {} };
                },
            },
        }),
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
    fail: null as null | { method: string; pattern: RegExp; status: number },
    calls: [] as string[],
    authHeaders: [] as string[],
};
function json(status: number, body?: unknown) {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => (body === undefined ? '' : JSON.stringify(body)),
    };
}
const fakeFetch = async (url: string, init: any) => {
    const method = init.method;
    const path = url.replace('https://api.github.com', '').split('?')[0];
    gh.calls.push(`${method} ${path}`);
    gh.authHeaders.push(init.headers.Authorization);
    if (gh.fail && gh.fail.method === method && gh.fail.pattern.test(path))
        return json(gh.fail.status, { message: 'Awaria atrapy' });
    let m: RegExpMatchArray | null;
    if (path === '/orgs/envi-konsulting/invitations' && method === 'GET')
        return json(200, gh.invitations);
    if (path === '/orgs/envi-konsulting/invitations' && method === 'POST') {
        const body = JSON.parse(init.body);
        const invitation = { id: gh.next++, email: body.email, login: null };
        gh.invitations.push(invitation);
        return json(201, invitation);
    }
    if ((m = path.match(/^\/orgs\/envi-konsulting\/invitations\/(\d+)$/)) && method === 'DELETE') {
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
        return json(200, [...gh.members.keys()].map((login) => ({ login })));
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
        seed('ACTIVE', { githubLogin: 'Osoba-GH', githubInvitationId: 77, drivePermissionId: 'perm-old' });
    } else if (status) {
        seed(status, { githubLogin: 'Osoba-GH' });
    }
}

beforeEach(() => {
    drive.perms.clear();
    drive.next = 1;
    drive.fail = null;
    drive.calls = [];
    gh.members = new Map([['oramm', { role: 'admin' }]]);
    gh.invitations = [];
    gh.next = 500;
    gh.fail = null;
    gh.calls = [];
    gh.authHeaders = [];
    db.states.clear();
    db.events = [];
    db.accounts = new Map([
        [PERSON, { personId: PERSON, name: 'Jan', surname: 'Test', systemEmail: EMAIL, isActive: true, systemRoleName: 'ENVI_EMPLOYEE' }],
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
                if (op.startsWith('link') && status === 'INVITED') seed('INVITED', { githubInvitationId: 77 });
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
        // Po przyjęciu zaproszenia to samo konto ponownie = aktywacja.
        gh.members.set('Osoba-GH', { role: 'member' });
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
    it('zarządza tylko ADMIN/ENVI_MANAGER ze znacznikiem', async () => {
        const user = (role: string, enviId: number) => ({ systemRoleName: role, enviId }) as any;
        expect(await SbAccessController.canManage(user('ENVI_MANAGER', MANAGER))).toBe(true);
        expect(await SbAccessController.canManage(user('ADMIN', MANAGER))).toBe(true);
        expect(await SbAccessController.canManage(user('ENVI_MANAGER', 126))).toBe(false);
        expect(await SbAccessController.canManage(user('ADMIN', 126))).toBe(false);
        expect(await SbAccessController.canManage(user('ENVI_EMPLOYEE', MANAGER))).toBe(false);
        expect(await SbAccessController.canManage(undefined)).toBe(false);
    });

    it('żaden zapis w historii nie zawiera tokenu', async () => {
        gh.fail = { method: 'POST', pattern: /invitations$/, status: 401 };
        await SbAccessController.invite(PERSON, MANAGER);
        expect(JSON.stringify(db.events)).not.toContain(TOKEN);
    });
});
