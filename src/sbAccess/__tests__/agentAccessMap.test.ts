/// <reference types="jest" />
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { app } from '../../index';

jest.mock('../../index', () => ({
    app: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(), use: jest.fn() },
}));
const mockHasFlag = jest.fn<(...args: any[]) => any>();
const mockCostFlag = jest.fn<(...args: any[]) => any>();
jest.mock('../../staff/StaffMemberRepository', () => ({
    __esModule: true,
    default: {
        hasSbAccessManagement: (...args: any[]) => mockHasFlag(...args),
        hasCostInvoiceAccess: (...args: any[]) => mockCostFlag(...args),
    },
}));

import PersonRepository from '../../persons/PersonRepository';
import SbAccessController from '../SbAccessController';
import SbAccessRepository from '../SbAccessRepository';
import SbDriveGateway from '../SbDriveGateway';
import { parseHealthReport } from '../sbHealthPolicy';
import {
    AGENT_DRIVES,
    AgentAccessInput,
    ENVI_MG_FOLDERS,
    agentAccessMap,
    driveMembership,
    resetDriveMembersCache,
} from '../agentAccessMap';

const MANAGERS = ['Marek Gazda', 'Michał Kotala'];
const NO_LEVELS = { repos: 'none', psDb: 'none', drive: 'none', mail: [] } as const;
const input = (extra: Partial<AgentAccessInput> = {}): AgentAccessInput => ({
    personId: 152,
    person: 'Monika Tymczyszyn',
    statusCode: 'ACTIVE',
    levels: { ...NO_LEVELS, mail: [] },
    githubLinked: false,
    hasAgentKey: true,
    hasCostInvoiceAccess: false,
    finEnabled: false,
    fidmanEnabled: true,
    mailboxes: [],
    sbManagers: MANAGERS,
    accountManagers: ['Agnieszka Brodziak', ...MANAGERS],
    driveTool: null,
    googleAccount: 'monika@example.com',
    drive: { drives: ['PS.ENVI', 'Biuro'], envMgFolders: ENVI_MG_FOLDERS.map((f) => f.label) },
    now: new Date('2026-11-19T12:00:00Z'),
    ...extra,
});
const system = (map: ReturnType<typeof agentAccessMap>, name: string) => map.systems.find((s) => s.system === name)!;

describe('AGD-2: mapa dostępów agenta osoby', () => {
    it('osoba bez poziomów: baza PS i zapis "nie ma" z imionami osób, które nadają poziomy; zero tras', () => {
        const map = agentAccessMap(input());
        for (const name of ['psRead', 'psWrite']) {
            expect(system(map, name).state).toBe('nie ma');
            expect(system(map, name).askWhom).toEqual(MANAGERS);
            expect(system(map, name).sentence).toContain('Marek Gazda, Michał Kotala');
            expect(system(map, name).sentence).toContain('„baza PS: brak”');
        }
        expect(map.psRoutes.level).toBe('none');
        expect(map.psRoutes.allowed).toBe(0);
        expect(map.psRoutes.routes.every((r) => !r.allowed)).toBe(true);
        expect(map.psRoutes.counts.odczyt + map.psRoutes.counts.zapis + map.psRoutes.counts.zamkniete).toBe(map.psRoutes.routes.length);
        expect(map.systems.map((s) => s.system)).toEqual(
            ['psRead', 'psWrite', 'drive', 'mail', 'costInvoices', 'fin', 'fidman', 'tar', 'aqm', 'sbRepos']);
        expect(system(map, 'sbRepos').state).toBe('nie ma');
    });

    it('poziom odczyt: czyta PS, zapisu nie ma; zapis: oba, liczniki z tabeli tras', () => {
        const ro = agentAccessMap(input({ levels: { ...NO_LEVELS, psDb: 'ro', mail: [] } }));
        expect(system(ro, 'psRead').state).toBe('ma');
        expect(system(ro, 'psWrite').state).toBe('nie ma');
        expect(system(ro, 'psWrite').sentence).toContain('tylko odczyt');
        expect(ro.psRoutes.allowed).toBe(ro.psRoutes.counts.odczyt);

        const rw = agentAccessMap(input({ levels: { ...NO_LEVELS, psDb: 'rw', mail: [] } }));
        expect(system(rw, 'psWrite').state).toBe('ma');
        expect(system(rw, 'psWrite').askWhom).toEqual([]);
        expect(rw.psRoutes.allowed).toBe(rw.psRoutes.counts.odczyt + rw.psRoutes.counts.zapis);
        expect(rw.psRoutes.routes.find((r) => r.method === 'POST' && r.path === '/offer')!.allowed).toBe(true);
    });

    it('poziom bez zarejestrowanego klucza albo wpis zaproszony: PS "nie ma" ze zdaniem, co zrobić', () => {
        const noKey = agentAccessMap(input({ levels: { ...NO_LEVELS, psDb: 'rw', mail: [] }, hasAgentKey: false }));
        expect(system(noKey, 'psRead').state).toBe('nie ma');
        expect(system(noKey, 'psRead').sentence).toContain('instalator');
        const invited = agentAccessMap(input({ levels: { ...NO_LEVELS, psDb: 'rw', mail: [] }, statusCode: 'INVITED' }));
        expect(system(invited, 'psWrite').sentence).toContain('To moje konto');
        expect(invited.psRoutes.allowed).toBe(0);
    });

    it('administrator sam jest osobą: zdanie bez prośby do siebie, askWhom puste', () => {
        const map = agentAccessMap(input({ person: 'Marek Gazda', sbManagers: [], accountManagers: [] }));
        expect(system(map, 'psRead').askWhom).toEqual([]);
        expect(system(map, 'psRead').sentence).toContain('Możesz to nadać sam');
        expect(system(map, 'psRead').sentence).not.toContain('Kogo poprosić');
        expect(system(map, 'tar').askWhom).toEqual([]);
        expect(system(map, 'tar').sentence).not.toContain('Zgłoś się do administratora');
        // Inna osoba bez nikogo do poproszenia trafia do administratora.
        expect(system(agentAccessMap(input({ sbManagers: [] })), 'psRead').askWhom).toEqual(['Marek Gazda']);
    });

    it('poczta: liczba i najwyżej 3 adresy, pełna lista w details; zablokowany wpis = "nie ma"', () => {
        const mailboxes = ['a', 'b', 'c', 'd', 'e'].map((x) => ({ code: x, address: `${x}@e.pl`, source: 'projekt' })) as any;
        const mail = system(agentAccessMap(input({ mailboxes })), 'mail');
        expect(mail.state).toBe('ma');
        expect(mail.sentence).toBe('Agent ma 5 skrzynek poczty: a@e.pl, b@e.pl, c@e.pl i 2 innych.');
        expect((mail.details as any).mailboxes).toHaveLength(5);
        for (const statusCode of ['BLOCKED', 'INVITED'] as const) {
            const m = system(agentAccessMap(input({ mailboxes, statusCode })), 'mail');
            expect(m.state).toBe('nie ma');
            expect(m.sentence).toContain(statusCode === 'INVITED' ? 'To moje konto' : 'zablokowany');
        }
    });

    it('Dysk z członkostwem i bez raportu o skrypcie: "ma", członek PS.ENVI i Biura, stan skryptu nieznany', () => {
        const drive = system(agentAccessMap(input()), 'drive');
        expect(drive.state).toBe('ma');
        expect(drive.sentence).toContain('członek PS.ENVI, Biuro');
        expect(drive.sentence).toContain('stan skryptu nieznany');
        expect(drive.details).toMatchObject({ script: 'nieznany', accountSource: 'konto PS', envMgFolders: { readable: 5, total: 5 } });
    });

    it('Dysk bez członkostwa: "nie ma" i do administratora; skrypt z błędem: "nie ma" ze zdaniem, co zrobić', () => {
        const none = system(agentAccessMap(input({ drive: { drives: [], envMgFolders: [] } })), 'drive');
        expect(none.state).toBe('nie ma');
        expect(none.sentence).toContain('nie jest członkiem');
        expect(none.askWhom).toEqual(['Marek Gazda']);

        const broken = system(agentAccessMap(input({ driveTool: { name: 'dysk-google', ok: false, error: 'token wygasł', account: 'monika@example.com' } })), 'drive');
        expect(broken.state).toBe('nie ma');
        expect(broken.sentence).toContain('Zaloguj go ponownie');
        expect(broken.details).toMatchObject({ script: 'blad', accountSource: 'raport komputera' });

        const ok = system(agentAccessMap(input({ driveTool: { name: 'dysk-google', ok: true, account: 'monika@example.com' } })), 'drive');
        expect(ok.sentence).toContain('skrypt działa');
        const unchecked = system(agentAccessMap(input({ drive: null })), 'drive');
        expect(unchecked.state).toBe('ma');
        expect(unchecked.sentence).toContain('nie sprawdził');
    });

    it('FIDman, TAR, AQM: agent tego nie robi; FIN i faktury kosztowe ze znaczników osoby', () => {
        const map = agentAccessMap(input());
        for (const name of ['fidman', 'tar', 'aqm']) expect(system(map, name).state).toBe('agent tego nie robi');
        expect(system(map, 'tar').sentence).toContain('nie ustalono');
        expect(system(map, 'fin').state).toBe('nie ma');
        expect(system(map, 'fin').askWhom).toEqual(['Agnieszka Brodziak', ...MANAGERS]);
        expect(system(map, 'costInvoices').state).toBe('nie ma');

        const full = agentAccessMap(input({ finEnabled: true, hasCostInvoiceAccess: true, levels: { ...NO_LEVELS, psDb: 'ro', mail: [] } }));
        expect(system(full, 'fin').state).toBe('ma');
        expect(system(full, 'costInvoices').state).toBe('ma');
    });

    it('raport zdrowia przyjmuje pozycję dysk-google z adresem konta; adres w innych pozycjach i nie-adres odpada', () => {
        const report = parseHealthReport({
            tools: [
                { name: 'dysk-google', ok: true, account: 'Monika@Example.com', token: 'ya29.abc' },
                { name: 'baza-ps', ok: true, account: 'x@example.com' },
                { name: 'dysk-google-2', ok: false, error: 'blad', account: 'nie adres' },
            ],
        });
        expect(report.tools).toEqual([
            { name: 'dysk-google', ok: true, account: 'monika@example.com' },
            { name: 'baza-ps', ok: true },
            { name: 'dysk-google-2', ok: false, error: 'blad' },
        ]);
    });

    it('członkowie Dysku: jedno czytanie na wszystkie pytania przez 15 minut; błąd = null i ponowna próba', async () => {
        resetDriveMembersCache();
        const list = jest.spyOn(SbDriveGateway, 'listUserEmails').mockImplementation(async (id: string) =>
            new Set(id === AGENT_DRIVES[0].id || id === ENVI_MG_FOLDERS[0].id ? ['monika@example.com'] : []));
        expect(await driveMembership('Monika@Example.com', 0)).toEqual({ drives: ['PS.ENVI'], envMgFolders: ['ENV.PROC procedury'] });
        await driveMembership('inna@example.com', 60 * 1000);
        expect(list).toHaveBeenCalledTimes(AGENT_DRIVES.length + ENVI_MG_FOLDERS.length);

        resetDriveMembersCache();
        list.mockRejectedValueOnce(new Error('403'));
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(await driveMembership('monika@example.com', 0)).toBeNull();
        expect(await driveMembership('monika@example.com', 0)).not.toBeNull();
        list.mockRestore();
    });
});

describe('AGD-2: trasy mapy dostępów', () => {
    const routes: { method: string; path: string; handler: any; order: number }[] = [];
    let guard: any;
    let guardOrder = 0;
    const DEVICE_TOKEN = 'A'.repeat(43);
    const SECRETS = {
        jwkN: 'n'.repeat(342),
        agentKeyHash: 'f'.repeat(64),
        githubToken: 'ghp_' + 'Z'.repeat(36),
    };

    beforeAll(() => {
        require('../SbAccessRouters');
        for (const method of ['get', 'post', 'put', 'delete'] as const) {
            const mock = (app as any)[method] as jest.Mock;
            mock.mock.calls.forEach((call: any, i: number) =>
                routes.push({ method, path: call[0], handler: call[1], order: mock.mock.invocationCallOrder[i] }));
        }
        const use = app.use as unknown as jest.Mock;
        const index = use.mock.calls.findIndex((c: any) => c[0] === '/sbAccess');
        guard = use.mock.calls[index][1];
        guardOrder = use.mock.invocationCallOrder[index];
    });

    beforeEach(() => {
        jest.restoreAllMocks();
        resetDriveMembersCache();
        mockHasFlag.mockReset();
        mockCostFlag.mockReset().mockResolvedValue(false);
        const record = {
            id: 1, personId: 152, statusCode: 'ACTIVE', githubLogin: null, githubInvitationId: null,
            drivePermissionId: 'perm-1', isGrantedManually: false, levels: { ...NO_LEVELS, mail: [] },
            publicKeyJwk: { kty: 'RSA', n: SECRETS.jwkN, e: 'AQAB' }, createdAt: new Date(), updatedAt: new Date(),
        } as any;
        jest.spyOn(SbAccessRepository.prototype, 'getByDeviceTokenHash').mockResolvedValue(record);
        jest.spyOn(SbAccessRepository.prototype, 'getByPersonId').mockResolvedValue(record);
        jest.spyOn(SbAccessRepository.prototype, 'getPersonAccount').mockResolvedValue({
            personId: 152, name: 'Monika', surname: 'Tymczyszyn', systemEmail: 'Monika@example.com', isActive: true, systemRoleName: 'ENVI_EMPLOYEE',
        });
        jest.spyOn(SbAccessRepository.prototype, 'getAgentKeyHash').mockResolvedValue(SECRETS.agentKeyHash);
        jest.spyOn(SbAccessRepository.prototype, 'getHealth').mockResolvedValue({
            // Jak w repozytorium: raport z bazy przechodzi przez białą listę.
            report: parseHealthReport({ tools: [{ name: 'baza-ps', ok: false, error: `odmowa ${SECRETS.githubToken}` }] }),
            reportedAt: new Date(), refreshRequestedAt: null,
        });
        jest.spyOn(SbAccessRepository.prototype, 'listActiveInRoles').mockResolvedValue([
            { personId: 10, name: 'Agnieszka', surname: 'Brodziak', systemRoleName: 'ENVI_MANAGER', canManageSb: false },
            { personId: 125, name: 'Marek', surname: 'Gazda', systemRoleName: 'ENVI_MANAGER', canManageSb: true },
            { personId: 125, name: 'Marek', surname: 'Gazda', systemRoleName: 'ENVI_MANAGER', canManageSb: false },
            { personId: 11, name: 'Michał', surname: 'Kotala', systemRoleName: 'ENVI_MANAGER', canManageSb: true },
            // Sama osoba (152) nie trafia na własną listę "kogo poprosić".
            { personId: 152, name: 'Monika', surname: 'Tymczyszyn', systemRoleName: 'ENVI_MANAGER', canManageSb: true },
        ]);
        jest.spyOn(PersonRepository.prototype, 'getPersonAccountV2').mockResolvedValue({
            personId: 152, isActive: true, finEnabled: false, fidmanEnabled: true,
        } as any);
        jest.spyOn(SbAccessController, 'listPersonMailboxes').mockResolvedValue({ mailboxes: [] });
        jest.spyOn(SbDriveGateway, 'listUserEmails').mockImplementation(async (id: string) =>
            new Set(id === AGENT_DRIVES[0].id || id === AGENT_DRIVES[2].id ? ['monika@example.com'] : []));
    });

    const route = (method: string, path: string) => {
        const found = routes.find((r) => r.method === method && r.path === path);
        if (!found) throw new Error(`brak trasy ${method} ${path}`);
        return found;
    };
    const makeRes = () => {
        const res: any = { setHeader: jest.fn() };
        res.status = jest.fn().mockReturnValue(res);
        res.send = jest.fn().mockReturnValue(res);
        return res;
    };

    it('me/agentAccess stoi przed bramką, podgląd osoby za nią; bramka odmawia osobie bez uprawnień', async () => {
        expect(route('get', '/sbAccess/me/agentAccess').order).toBeLessThan(guardOrder);
        expect(route('get', '/sbAccess/:personId/agentAccess').order).toBeGreaterThan(guardOrder);
        jest.spyOn(SbAccessRepository.prototype, 'getPersonAccount').mockResolvedValue({ isActive: true, systemRoleName: 'ENVI_EMPLOYEE' } as any);
        mockHasFlag.mockResolvedValue(true);
        const res = makeRes();
        const next = jest.fn();
        await guard({ session: { userData: { enviId: 152 } } }, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('token komputera osoby bez poziomów: mapa z "nie ma" dla PS i Dyskiem z członkostwa; bez sekretów', async () => {
        const res = makeRes();
        const next = jest.fn();
        await route('get', '/sbAccess/me/agentAccess').handler({ session: {}, headers: { 'x-envi-sb-device-token': DEVICE_TOKEN } }, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
        const map = res.send.mock.calls[0][0];
        expect(map.personId).toBe(152);
        expect(map.person).toBe('Monika Tymczyszyn');
        expect(system(map, 'psRead')).toMatchObject({ state: 'nie ma', askWhom: MANAGERS });
        expect(system(map, 'psWrite').state).toBe('nie ma');
        expect(system(map, 'drive').sentence).toBe(
            'Agent czyta Dysk Twoim kontem Google monika@example.com: członek PS.ENVI, Biuro; procedury i wzory ENVI-MG: 0 z 5 folderów; '
            + 'stan skryptu nieznany (komputer nie przysłał jeszcze raportu o skrypcie Google).');
        const json = JSON.stringify(map);
        for (const secret of Object.values(SECRETS)) expect(json).not.toContain(secret);
        expect(json).not.toContain('perm-1');
    });

    it('podgląd osoby w Dostępach SB: ta sama mapa; osoba bez wpisu -> 404', async () => {
        const res = makeRes();
        await route('get', '/sbAccess/:personId/agentAccess').handler({ session: {}, params: { personId: '152' } }, res, jest.fn());
        expect(system(res.send.mock.calls[0][0], 'drive').state).toBe('ma');

        jest.spyOn(SbAccessRepository.prototype, 'getByPersonId').mockResolvedValue(null);
        const missing = makeRes();
        await route('get', '/sbAccess/:personId/agentAccess').handler({ session: {}, params: { personId: '999' } }, missing, jest.fn());
        expect(missing.status).toHaveBeenCalledWith(404);
    });
});
