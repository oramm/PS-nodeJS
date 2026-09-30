/// <reference types="jest" />
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { app } from '../../index';

jest.mock('../../index', () => ({
    app: {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
        use: jest.fn(),
    },
}));

const mockHasFlag = jest.fn<(...args: any[]) => any>();
jest.mock('../../staff/StaffMemberRepository', () => ({
    __esModule: true,
    default: { hasSbAccessManagement: (...args: any[]) => mockHasFlag(...args) },
}));

import SbAccessController from '../SbAccessController';
import { SbAccessError } from '../sbAccessPolicy';

function makeRes() {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
}
const req = (userData: any, extra: any = {}) =>
    ({ session: userData ? { userData } : {}, params: {}, query: {}, ...extra }) as any;

const MANAGER = { systemRoleName: 'ENVI_MANAGER', enviId: 125 };
const ADMIN = { systemRoleName: 'ADMIN', enviId: 1 };
const EMPLOYEE = { systemRoleName: 'ENVI_EMPLOYEE', enviId: 131 };

type Registration = { method: string; path: string; handler: any; order: number };

describe('SbAccessRouters - bramka i trasy', () => {
    const routes: Registration[] = [];
    let guard: any;
    let guardOrder = 0;

    beforeAll(() => {
        require('../SbAccessRouters');
        for (const method of ['get', 'post', 'put'] as const) {
            const mock = (app as any)[method] as jest.Mock;
            mock.mock.calls.forEach((call: any, i: number) =>
                routes.push({ method, path: call[0], handler: call[1], order: mock.mock.invocationCallOrder[i] }),
            );
        }
        const use = app.use as unknown as jest.Mock;
        const index = use.mock.calls.findIndex((c: any) => c[0] === '/sbAccess');
        guard = use.mock.calls[index][1];
        guardOrder = use.mock.invocationCallOrder[index];
    });

    beforeEach(() => {
        mockHasFlag.mockReset();
    });

    const route = (method: string, path: string) => {
        const found = routes.find((r) => r.method === method && r.path === path);
        if (!found) throw new Error(`brak trasy ${method} ${path}`);
        return found;
    };

    it('komplet tras zarządzania stoi ZA bramką, a pytanie o dostęp i "moje konto" przed nią', () => {
        expect(route('get', '/sbAccess/access').order).toBeLessThan(guardOrder);
        expect(route('post', '/sbAccess/me/githubAccount').order).toBeLessThan(guardOrder);
        for (const [method, path] of [
            ['get', '/sbAccess/entries'],
            ['get', '/sbAccess/candidates'],
            ['get', '/sbAccess/githubMembers/unlinked'],
            ['get', '/sbAccess/:personId/events'],
            ['post', '/sbAccess/:personId/invite'],
            ['post', '/sbAccess/:personId/block'],
            ['post', '/sbAccess/:personId/unblock'],
            ['post', '/sbAccess/:personId/revoke'],
            ['put', '/sbAccess/:personId/githubAccount'],
        ])
            expect(route(method, path).order).toBeGreaterThan(guardOrder);
        // Nic poza tymi dwiema trasami nie jest zarejestrowane przed bramką.
        expect(routes.filter((r) => r.order < guardOrder)).toHaveLength(2);
    });

    it('bez sesji -> 401', async () => {
        const res = makeRes();
        const next = jest.fn();
        await guard(req(null), res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    it('kierownik bez znacznika -> 403; ze znacznikiem -> dalej', async () => {
        mockHasFlag.mockResolvedValue(false);
        let res = makeRes();
        let next = jest.fn();
        await guard(req(MANAGER), res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();

        mockHasFlag.mockResolvedValue(true);
        res = makeRes();
        next = jest.fn();
        await guard(req(MANAGER), res, next);
        expect(next).toHaveBeenCalledWith();
        expect(mockHasFlag).toHaveBeenCalledWith(125);
    });

    it('ADMIN też potrzebuje znacznika', async () => {
        mockHasFlag.mockResolvedValue(false);
        const res = makeRes();
        await guard(req(ADMIN), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
    });

    it('pracownik ze znacznikiem -> 403 (rola spoza listy zarządzających)', async () => {
        mockHasFlag.mockResolvedValue(true);
        const res = makeRes();
        const next = jest.fn();
        await guard(req(EMPLOYEE), res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('GET /sbAccess/access odpowiada canManage dla każdego zalogowanego', async () => {
        mockHasFlag.mockResolvedValue(true);
        const res = makeRes();
        await route('get', '/sbAccess/access').handler(req(EMPLOYEE), res, jest.fn());
        expect(res.send).toHaveBeenCalledWith({ canManage: false });
    });

    it('zaproszenie: osoba z adresu trasy, zlecający z sesji; adres e-mail z żądania ignorowany', async () => {
        const invite = jest
            .spyOn(SbAccessController, 'invite')
            .mockResolvedValue({ result: 'OK', note: 'ok', state: null });
        const res = makeRes();
        await route('post', '/sbAccess/:personId/invite').handler(
            req(MANAGER, { params: { personId: '131' }, parsedBody: { email: 'obcy@zly.test' } }),
            res,
            jest.fn(),
        );
        expect(invite).toHaveBeenCalledWith(131, 125);
        expect(res.send).toHaveBeenCalledWith({ result: 'OK', note: 'ok', state: null });
    });

    it('FAILED -> 502 z uwagą; SbAccessError -> jego status, bez globalnego handlera', async () => {
        jest.spyOn(SbAccessController, 'block').mockResolvedValue({ result: 'FAILED', note: 'GitHub: błąd', state: null });
        let res = makeRes();
        await route('post', '/sbAccess/:personId/block').handler(req(MANAGER, { params: { personId: '5' } }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(502);

        jest.spyOn(SbAccessController, 'revoke').mockRejectedValue(new SbAccessError(503, 'Funkcja nieskonfigurowana'));
        res = makeRes();
        const next = jest.fn();
        await route('post', '/sbAccess/:personId/revoke').handler(req(MANAGER, { params: { personId: '5' } }), res, next);
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.send).toHaveBeenCalledWith({ errorMessage: 'Funkcja nieskonfigurowana' });
        expect(next).not.toHaveBeenCalled();
    });

    it('niepoprawny identyfikator osoby -> 400', async () => {
        const res = makeRes();
        await route('post', '/sbAccess/:personId/unblock').handler(req(MANAGER, { params: { personId: 'abc' } }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('"moje konto": osoba zawsze z sesji, tryb self', async () => {
        const link = jest
            .spyOn(SbAccessController, 'linkGithub')
            .mockResolvedValue({ result: 'OK', note: 'ok', state: null });
        const res = makeRes();
        await route('post', '/sbAccess/me/githubAccount').handler(
            req(EMPLOYEE, { parsedBody: { githubLogin: '@Osoba-GH', personId: 999 } }),
            res,
            jest.fn(),
        );
        expect(link).toHaveBeenCalledWith(131, 'Osoba-GH', 131, 'self');
    });

    it('login GitHub o niepoprawnej postaci -> 400', async () => {
        const res = makeRes();
        await route('put', '/sbAccess/:personId/githubAccount').handler(
            req(MANAGER, { params: { personId: '131' }, parsedBody: { githubLogin: 'zly login/../' } }),
            res,
            jest.fn(),
        );
        expect(res.status).toHaveBeenCalledWith(400);
    });
});
