/// <reference types="jest" />
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { app } from '../../index';

jest.mock('../../index', () => ({
    app: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(), use: jest.fn() },
}));
const mockHasFlag = jest.fn<(...args: any[]) => any>();
jest.mock('../../staff/StaffMemberRepository', () => ({
    __esModule: true,
    default: { hasSbAccessManagement: (...args: any[]) => mockHasFlag(...args) },
}));

import ToolsDb from '../../tools/ToolsDb';
import SbAccessController from '../SbAccessController';
import SbAccessEventRepository from '../SbAccessEventRepository';
import SbAccessRepository from '../SbAccessRepository';
import SbAccessSecretRepository from '../SbAccessSecretRepository';
import { SbAccessError } from '../sbAccessPolicy';
import {
    SB_HEALTH_STALE_DAYS,
    healthReportFileName,
    isHealthStale,
    parseHealthReport,
    sanitizeHealthText,
    summarizeHealth,
} from '../sbHealthPolicy';

const HOUR = 3600 * 1000;
const NOW = new Date('2026-10-19T12:00:00Z');
const ago = (hours: number) => new Date(NOW.getTime() - hours * HOUR);
const LEVELS = { repos: 'read', psDb: 'ro', drive: 'none', mail: ['faktury'] } as const;
const record = (extra: any = {}) =>
    ({
        id: 1, personId: 131, statusCode: 'ACTIVE', githubLogin: null, githubInvitationId: null,
        drivePermissionId: null, isGrantedManually: false, levels: { ...LEVELS, mail: [...LEVELS.mail] },
        publicKeyJwk: null, createdAt: new Date(), updatedAt: new Date(), ...extra,
    }) as any;
const BASE64_SECRET = Buffer.alloc(60, 7).toString('base64'); // 80 znaków

describe('Raport zdrowia - biała lista', () => {
    it('migracja 005: trzy kolumny w SbAccess (idempotentnie) i akcja prośby; bez zmian danych', () => {
        const source = readFileSync(join(__dirname, '../migrations/005_sb_access_health.sql'), 'utf8').replace(/--[^\r\n]*/g, '');
        for (const column of ['HealthReport JSON NULL', 'HealthReportedAt DATETIME NULL', 'HealthRefreshRequestedAt DATETIME NULL'])
            expect(source).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
        expect(source).toContain("'REQUEST_HEALTH'");
        expect(source).not.toMatch(/UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP/i);
    });

    it('zapisuje tylko pola z listy: nieznane pola na każdym poziomie nie przechodzą', () => {
        const report = parseHealthReport({
            sbVersion: '1.14',
            installerVersion: '0.16.0',
            password: 'tajne',
            mailBody: 'tresc listu',
            tools: [{ name: 'baza-ps', ok: false, error: 'logowanie odrzucone', token: 'abc', password: 'x' }, { name: 'dysk', ok: true, error: 'zbedne' }],
            events: ['linia'],
            personId: 5,
            reportedAt: '2001-01-01',
        });
        expect(report).toEqual({
            sbVersion: '1.14',
            installerVersion: '0.16.0',
            tools: [{ name: 'baza-ps', ok: false, error: 'logowanie odrzucone' }, { name: 'dysk', ok: true }],
            events: ['linia'],
        });
        expect(JSON.stringify(report)).not.toMatch(/tajne|tresc listu|abc|personId|2001/);
    });

    it('przycina długości: opis błędu i linie do 200 znaków, wersje do 30, 30 narzędzi, 20 linii', () => {
        const report = parseHealthReport({
            sbVersion: 'v.'.repeat(50),
            tools: Array.from({ length: 45 }, (_, i) => ({ name: `narzedzie-${i}`, ok: false, error: 'blad '.repeat(100) })),
            events: Array.from({ length: 35 }, () => 'zdarzenie '.repeat(60)),
        });
        expect(report.sbVersion).toHaveLength(30);
        expect(report.tools).toHaveLength(30);
        expect(report.tools.every((tool) => (tool.error ?? '').length <= 200)).toBe(true);
        expect(report.events).toHaveLength(20);
        expect(report.events.every((line) => line.length <= 200)).toBe(true);
    });

    it('sekretopodobne wartości są maskowane: długi base64, prefiksy tokenów; zwykły tekst zostaje', () => {
        expect(sanitizeHealthText(`haslo ${BASE64_SECRET} koniec`, 200)).toBe('haslo [ukryto] koniec');
        expect(sanitizeHealthText('token ghp_abcdefghijklmnopqrstuvwxyz0123456789 ok', 200)).toBe('token [ukryto] ok');
        expect(sanitizeHealthText('ya29.a0AfH6SMBx-qwerty', 200)).toBe('[ukryto]');
        expect(sanitizeHealthText('x'.repeat(40), 200)).toBe('x'.repeat(40)); // granica: 40 znaków jeszcze nie jest sekretem
        expect(sanitizeHealthText('x'.repeat(41), 200)).toBe('[ukryto]');
        expect(sanitizeHealthText('baza PS: logowanie odrzucone (haslo nieaktualne)', 200)).toBe('baza PS: logowanie odrzucone (haslo nieaktualne)');
        const report = parseHealthReport({ tools: [{ name: 'dysk', ok: false, error: BASE64_SECRET }], events: [`klucz: ${BASE64_SECRET}`] });
        expect(JSON.stringify(report)).not.toContain(BASE64_SECRET.slice(0, 20));
    });

    it('maskuje przed przycięciem: sekret dłuższy niż limit nie zostaje w ucięciu', () => {
        expect(sanitizeHealthText('A'.repeat(500), 200)).toBe('[ukryto]');
    });

    it('znaki sterujące i nowe linie zamieniane na spację; puste linie odpadają', () => {
        expect(sanitizeHealthText('a\r\nb\u0000c', 50)).toBe('a b c');
        expect(parseHealthReport({ tools: [], events: ['', '   ', 5, null, 'ok'] }).events).toEqual(['ok']);
    });

    it('złe pozycje narzędzi są pomijane, duplikaty nazw: zostaje pierwsze', () => {
        const report = parseHealthReport({
            tools: [
                { name: 'Poczta Faktury', ok: true }, { name: 'a'.repeat(41), ok: true }, { name: 'dysk', ok: 'tak' },
                null, 'dysk', { ok: true }, { name: 'dysk', ok: true }, { name: 'dysk', ok: false },
            ],
        });
        expect(report.tools).toEqual([{ name: 'dysk', ok: true }]);
    });

    it('wersja jako liczba (np. 1.14 sparsowane przez JSON) nie jest przyjmowana jako tekst', () => {
        expect(parseHealthReport({ sbVersion: 1.14, tools: [] }).sbVersion).toBeNull();
    });

    it.each([[null], ['tekst'], [[]], [{}], [{ tools: 'dysk' }]])('ciało bez sensu odrzucone 400: %j', (body) => {
        expect(() => parseHealthReport(body)).toThrow(SbAccessError);
        try { parseHealthReport(body); } catch (error: any) { expect(error.status).toBe(400); }
    });

    it('błąd bez opisu jest nadal błędem narzędzia', () => {
        expect(parseHealthReport({ tools: [{ name: 'dysk', ok: false }] }).tools).toEqual([{ name: 'dysk', ok: false }]);
    });
});

describe('Raport zdrowia - stan i granica 7 dni', () => {
    const report = parseHealthReport({ tools: [{ name: 'a', ok: true }, { name: 'b', ok: true }] });

    it('regula jest jedna: 7 dni', () => {
        expect(SB_HEALTH_STALE_DAYS).toBe(7);
    });

    it('6 dni 23 h nie jest starsze niż 7 dni, 7 dni 1 h jest; równo 7 dni jeszcze nie', () => {
        expect(isHealthStale(ago(6 * 24 + 23), NOW)).toBe(false);
        expect(isHealthStale(ago(7 * 24), NOW)).toBe(false);
        expect(isHealthStale(ago(7 * 24 + 1), NOW)).toBe(true);
        expect(summarizeHealth(report, ago(6 * 24 + 23), null, NOW).stale).toBe(false);
        expect(summarizeHealth(report, ago(7 * 24 + 1), null, NOW).stale).toBe(true);
    });

    it('stan: ok gdy wszystkie narzędzia działają, fail gdy którekolwiek nie; prośba oczekuje', () => {
        expect(summarizeHealth(report, ago(1), null, NOW)).toMatchObject({ state: 'ok', refreshRequested: false });
        const failing = parseHealthReport({ tools: [{ name: 'a', ok: true }, { name: 'b', ok: false, error: 'x' }] });
        expect(summarizeHealth(failing, ago(1), ago(2), NOW)).toMatchObject({ state: 'fail', refreshRequested: true });
    });

    it('nazwa pliku: ASCII, nazwisko bez polskich znaków i data raportu', () => {
        expect(healthReportFileName('Łukasiewicz-Żółć', new Date('2026-10-19T08:12:00Z'))).toBe('raport-sb-lukasiewicz-zolc-2026-10-19.json');
        expect(healthReportFileName('../..', new Date('2026-10-19T08:12:00Z'))).toBe('raport-sb-osoba-2026-10-19.json');
    });
});

describe('Raport zdrowia - kontroler i repozytorium', () => {
    const conn = { threadId: 9 } as any;
    let append: any;

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.spyOn(ToolsDb, 'transaction').mockImplementation(async (fn: any) => fn(conn));
        append = jest.spyOn(SbAccessEventRepository.prototype, 'append').mockResolvedValue(undefined);
    });

    it('raport instalatora: zapis po białej liście dla osoby z rozstrzygnięcia, bez zdarzenia w historii', async () => {
        const save = jest.spyOn(SbAccessRepository.prototype, 'saveHealthReport').mockResolvedValue(undefined);
        const out = await SbAccessController.recordOwnHealth(record(), {
            sbVersion: '1.14', tools: [{ name: 'dysk', ok: true }], events: [], personId: 5, haslo: 'x',
        });
        expect(out).toEqual({ ok: true });
        expect(save).toHaveBeenCalledWith(131, { sbVersion: '1.14', installerVersion: null, tools: [{ name: 'dysk', ok: true }], events: [] });
        expect(append).not.toHaveBeenCalled();
    });

    it('zły raport -> 400 i nic nie zapisane', async () => {
        const save = jest.spyOn(SbAccessRepository.prototype, 'saveHealthReport').mockResolvedValue(undefined);
        await expect(SbAccessController.recordOwnHealth(record(), { tools: 'x' })).rejects.toMatchObject({ status: 400 });
        expect(save).not.toHaveBeenCalled();
    });

    it('zapis raportu: czas serwera (NOW()), czyszczenie prośby w tym samym UPDATE, nie executeSQL', async () => {
        const execute = jest.spyOn(ToolsDb, 'executeSQL');
        const query = jest.spyOn(ToolsDb, 'getQueryCallbackAsync').mockResolvedValue({} as any);
        const report = { sbVersion: '1', installerVersion: null, tools: [], events: [] };
        await new SbAccessRepository().saveHealthReport(131, report);
        const [sql, , params] = query.mock.calls[0] as any[];
        expect(execute).not.toHaveBeenCalled();
        expect(sql).toContain('HealthReportedAt = NOW()');
        expect(sql).toContain('HealthRefreshRequestedAt = NULL');
        expect(params).toEqual([JSON.stringify(report), 131]);
    });

    it('prośba admina: ustawiona pod blokadą wiersza, zdarzenie REQUEST_HEALTH z zlecającym', async () => {
        const get = jest.spyOn(SbAccessRepository.prototype, 'getByPersonId').mockResolvedValue(record());
        const request = jest.spyOn(SbAccessRepository.prototype, 'requestHealthRefresh').mockResolvedValue(false);
        expect(await SbAccessController.requestHealthRefresh(131, 1)).toEqual({ requested: true, alreadyPending: false });
        expect(get).toHaveBeenCalledWith(131, conn, true);
        expect(request).toHaveBeenCalledWith(conn, 131);
        expect(append.mock.calls[0][1]).toMatchObject({ personId: 131, actionCode: 'REQUEST_HEALTH', requestedByPersonId: 1, resultCode: 'OK' });
    });

    it('druga prośba, gdy jedna czeka: bez nowego zdarzenia', async () => {
        jest.spyOn(SbAccessRepository.prototype, 'getByPersonId').mockResolvedValue(record());
        jest.spyOn(SbAccessRepository.prototype, 'requestHealthRefresh').mockResolvedValue(true);
        expect(await SbAccessController.requestHealthRefresh(131, 1)).toEqual({ requested: true, alreadyPending: true });
        expect(append).not.toHaveBeenCalled();
    });

    it.each([['brak wpisu', null], ['zablokowany', record({ statusCode: 'BLOCKED' })], ['odebrany', record({ statusCode: 'REVOKED' })]])(
        'prośba odrzucona 409: %s', async (_label, found) => {
            jest.spyOn(SbAccessRepository.prototype, 'getByPersonId').mockResolvedValue(found);
            const request = jest.spyOn(SbAccessRepository.prototype, 'requestHealthRefresh');
            await expect(SbAccessController.requestHealthRefresh(131, 1)).rejects.toMatchObject({ status: 409 });
            expect(request).not.toHaveBeenCalled();
            expect(append).not.toHaveBeenCalled();
        });

    it('prośba w repozytorium: ustawiana tylko gdy nie czeka; czyta znacznik pod FOR UPDATE', async () => {
        const query = jest.spyOn(ToolsDb, 'getQueryCallbackAsync');
        query.mockResolvedValueOnce([{ requestedAt: null }] as any).mockResolvedValueOnce({} as any);
        expect(await new SbAccessRepository().requestHealthRefresh(conn, 131)).toBe(false);
        expect(String(query.mock.calls[0][0])).toContain('FOR UPDATE');
        expect(String(query.mock.calls[1][0])).toContain('HealthRefreshRequestedAt = NOW()');

        query.mockReset();
        query.mockResolvedValueOnce([{ requestedAt: new Date() }] as any);
        expect(await new SbAccessRepository().requestHealthRefresh(conn, 131)).toBe(true);
        expect(query).toHaveBeenCalledTimes(1);
    });

    it('pytanie instalatora o prośbę: tylko o własną osobę', async () => {
        const asked = jest.spyOn(SbAccessRepository.prototype, 'isHealthRefreshRequested').mockResolvedValue(true);
        expect(await SbAccessController.isOwnHealthRequested(record())).toEqual({ refreshRequested: true });
        expect(asked).toHaveBeenCalledWith(131);
    });

    it('lista rejestru niesie podsumowanie raportu: stan, wersje, narzędzia, zdarzenia, prośbę i szarość', async () => {
        jest.spyOn(ToolsDb, 'getQueryCallbackAsync').mockResolvedValue([
            { ...record(), healthReport: JSON.stringify({ sbVersion: '1.14', installerVersion: '0.16.0', tools: [{ name: 'baza-ps', ok: false, error: 'x' }], events: ['linia'] }),
                healthReportedAt: new Date(Date.now() - 8 * 24 * HOUR), healthRefreshRequestedAt: new Date(Date.now() - HOUR) },
            { ...record({ personId: 5 }), healthReport: null, healthReportedAt: null, healthRefreshRequestedAt: null },
        ] as any);
        jest.spyOn(SbAccessSecretRepository.prototype, 'listNames').mockResolvedValue([]);
        const [first, second] = await SbAccessController.list();
        expect(first.health).toMatchObject({
            sbVersion: '1.14', installerVersion: '0.16.0', state: 'fail', stale: true, refreshRequested: true,
            tools: [{ name: 'baza-ps', ok: false, error: 'x' }], events: ['linia'],
        });
        expect(second.health).toBeNull();
        expect(JSON.stringify(first)).not.toContain('healthReport');
    });

    it('plik raportu: nazwisko i data w nazwie, treść z osobą i raportem; bez raportu 404', async () => {
        jest.spyOn(SbAccessRepository.prototype, 'getPersonAccount').mockResolvedValue({ personId: 131, name: 'Agnieszka', surname: 'Brodziak', isActive: true } as any);
        const get = jest.spyOn(SbAccessRepository.prototype, 'getHealth').mockResolvedValue({
            report: { sbVersion: '1.14', installerVersion: '0.16.0', tools: [{ name: 'dysk', ok: true }], events: [] },
            reportedAt: new Date('2026-10-19T08:12:00Z'), refreshRequestedAt: null,
        });
        const file = await SbAccessController.healthReportFile(131);
        expect(file.fileName).toBe('raport-sb-brodziak-2026-10-19.json');
        expect(file.content).toMatchObject({ person: { name: 'Agnieszka', surname: 'Brodziak' }, sbVersion: '1.14', tools: [{ name: 'dysk', ok: true }] });
        get.mockResolvedValue({ report: null, reportedAt: null, refreshRequestedAt: null });
        await expect(SbAccessController.healthReportFile(131)).rejects.toMatchObject({ status: 404 });
        get.mockResolvedValue(null);
        await expect(SbAccessController.healthReportFile(131)).rejects.toMatchObject({ status: 404 });
    });
});

describe('Raport zdrowia - trasy i uprawnienia', () => {
    const routes: { method: string; path: string; handler: any; order: number }[] = [];
    let guard: any;
    let guardOrder = 0;
    const makeRes = () => {
        const res: any = {};
        res.status = jest.fn().mockReturnValue(res);
        res.send = jest.fn().mockReturnValue(res);
        res.setHeader = jest.fn();
        return res;
    };
    const route = (method: string, path: string) => routes.find((r) => r.method === method && r.path === path)!;

    beforeAll(() => {
        require('../SbAccessRouters');
        for (const method of ['get', 'post', 'put', 'delete'] as const) {
            const mock = (app as any)[method] as jest.Mock;
            mock.mock.calls.forEach((call: any, i: number) =>
                routes.push({ method, path: call[0], handler: call[1], order: mock.mock.invocationCallOrder[i] }),
            );
        }
        const use = app.use as unknown as jest.Mock;
        const index = use.mock.calls.findIndex((call: any) => call[0] === '/sbAccess');
        guard = use.mock.calls[index][1];
        guardOrder = use.mock.invocationCallOrder[index];
    });
    beforeEach(() => {
        jest.restoreAllMocks();
        mockHasFlag.mockReset();
    });

    it('trasy instalatora stoją NAD bramką, trasy admina POD nią', () => {
        expect(route('post', '/sbAccess/me/health').order).toBeLessThan(guardOrder);
        expect(route('get', '/sbAccess/me/healthRequest').order).toBeLessThan(guardOrder);
        expect(route('post', '/sbAccess/:personId/healthRequest').order).toBeGreaterThan(guardOrder);
        expect(route('get', '/sbAccess/:personId/healthReport').order).toBeGreaterThan(guardOrder);
    });

    it('POST me/health: osoba z tokenu, personId z treści ignorowany, ciało z req.body (nie parsedBody)', async () => {
        const resolve = jest.spyOn(SbAccessController, 'resolveSelf').mockResolvedValue(record());
        const save = jest.spyOn(SbAccessRepository.prototype, 'saveHealthReport').mockResolvedValue(undefined);
        const res = makeRes();
        await route('post', '/sbAccess/me/health').handler(
            { session: {}, headers: { 'x-envi-sb-device-token': 'T' }, body: { sbVersion: '1.10', tools: [], personId: 5 }, parsedBody: { sbVersion: 1.1, tools: [] } },
            res, jest.fn(),
        );
        expect(resolve).toHaveBeenCalledWith(undefined, 'T');
        expect(save).toHaveBeenCalledWith(131, expect.objectContaining({ sbVersion: '1.10' }));
        expect(res.send).toHaveBeenCalledWith({ ok: true });
    });

    it('POST me/health bez sesji i tokenu -> 401; zły raport -> 400', async () => {
        let res = makeRes();
        await route('post', '/sbAccess/me/health').handler({ session: {}, headers: {}, body: { tools: [] } }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);

        jest.spyOn(SbAccessController, 'resolveSelf').mockResolvedValue(record());
        res = makeRes();
        await route('post', '/sbAccess/me/health').handler({ session: { userData: { enviId: 131 } }, headers: {}, body: {} }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('GET me/healthRequest: token albo sesja, bez cache, odpowiedź refreshRequested', async () => {
        jest.spyOn(SbAccessController, 'resolveSelf').mockResolvedValue(record());
        jest.spyOn(SbAccessRepository.prototype, 'isHealthRefreshRequested').mockResolvedValue(true);
        const res = makeRes();
        await route('get', '/sbAccess/me/healthRequest').handler({ session: {}, headers: { 'x-envi-sb-device-token': 'T' } }, res, jest.fn());
        expect(res.send).toHaveBeenCalledWith({ refreshRequested: true });
        expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    });

    it('nie-admin nie dotknie raportu ani prośby: bramka odpowiada 403 i nie wpuszcza dalej', async () => {
        jest.spyOn(SbAccessRepository.prototype, 'getPersonAccount').mockResolvedValue({ personId: 131, isActive: true, systemRoleName: 'ENVI_EMPLOYEE' } as any);
        mockHasFlag.mockResolvedValue(true);
        const res = makeRes();
        const next = jest.fn();
        await guard({ session: { userData: { enviId: 131, systemRoleName: 'ENVI_EMPLOYEE' } } }, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
        const anonymous = makeRes();
        await guard({ session: {} }, anonymous, next);
        expect(anonymous.status).toHaveBeenCalledWith(401);
    });

    it('pracownik nie podejrzy cudzego raportu: jedyna trasa odczytu jest za bramką, a trasy "me" nie biorą personId', () => {
        const mePaths = routes.filter((r) => r.path.startsWith('/sbAccess/me/')).map((r) => r.path).sort();
        expect(mePaths).toEqual(
            ['/sbAccess/me/githubAccount', '/sbAccess/me/health', '/sbAccess/me/healthRequest', '/sbAccess/me/publicKey', '/sbAccess/me/secrets'].sort(),
        );
        expect(routes.filter((r) => r.path.startsWith('/sbAccess/me/')).every((r) => r.order < guardOrder)).toBe(true);
        expect(route('get', '/sbAccess/:personId/healthReport').order).toBeGreaterThan(guardOrder);
    });

    it('POST :personId/healthRequest: zlecający z sesji, zły numer osoby 400', async () => {
        const request = jest.spyOn(SbAccessController, 'requestHealthRefresh').mockResolvedValue({ requested: true, alreadyPending: false });
        await route('post', '/sbAccess/:personId/healthRequest').handler({ session: { userData: { enviId: 1 } }, params: { personId: '131' } }, makeRes(), jest.fn());
        expect(request).toHaveBeenCalledWith(131, 1);
        const bad = makeRes();
        await route('post', '/sbAccess/:personId/healthRequest').handler({ session: { userData: { enviId: 1 } }, params: { personId: 'x' } }, bad, jest.fn());
        expect(bad.status).toHaveBeenCalledWith(400);
    });

    it('GET :personId/healthReport: załącznik JSON z nazwiskiem i datą w nazwie, bez cache; brak raportu -> 404', async () => {
        const file = jest.spyOn(SbAccessController, 'healthReportFile').mockResolvedValue({ fileName: 'raport-sb-brodziak-2026-10-19.json', content: { sbVersion: '1.14' } });
        const res = makeRes();
        await route('get', '/sbAccess/:personId/healthReport').handler({ session: { userData: { enviId: 1 } }, params: { personId: '131' } }, res, jest.fn());
        expect(file).toHaveBeenCalledWith(131);
        expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="raport-sb-brodziak-2026-10-19.json"');
        expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
        expect(JSON.parse(res.send.mock.calls[0][0] as string)).toEqual({ sbVersion: '1.14' });

        file.mockRejectedValue(new SbAccessError(404, 'brak'));
        const missing = makeRes();
        await route('get', '/sbAccess/:personId/healthReport').handler({ session: { userData: { enviId: 1 } }, params: { personId: '131' } }, missing, jest.fn());
        expect(missing.status).toHaveBeenCalledWith(404);
    });
});
