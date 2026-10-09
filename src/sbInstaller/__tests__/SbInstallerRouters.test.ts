import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { app } from '../../index';

jest.mock('../../index', () => ({
    app: { get: jest.fn(), use: jest.fn() },
}));

import SbAccessRepository from '../../sbAccess/SbAccessRepository';
import { SbAccessRecord, SbPersonAccount } from '../../sbAccess/sbAccessTypes';

const USER = { enviId: 131, systemRoleName: 'ENVI_EMPLOYEE' };
const REFUSAL = 'Brak dostępu do Second Brain - poproś przełożonego o zaproszenie do SB w PS';

function makeRes() {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
}

describe('SbInstallerRouters - bramka rejestru SB', () => {
    let guard: any;
    let guardOrder: number;
    let packageOrder: number;
    let infoOrder: number;
    let info: (req: any, res: any, next: any) => void;
    let account: SbPersonAccount | null;
    let record: SbAccessRecord | null;

    beforeAll(() => {
        require('../SbInstallerRouters');
        const use = app.use as unknown as jest.Mock;
        const useIndex = use.mock.calls.findIndex((call: any) => call[0] === '/sbInstaller');
        guard = use.mock.calls[useIndex][1];
        guardOrder = use.mock.invocationCallOrder[useIndex];
        const get = app.get as unknown as jest.Mock;
        const getIndex = get.mock.calls.findIndex((call: any) => call[0] === '/sbInstaller/paczka');
        packageOrder = get.mock.invocationCallOrder[getIndex];
        const infoIndex = get.mock.calls.findIndex((call: any) => call[0] === '/sbInstaller/info');
        infoOrder = get.mock.invocationCallOrder[infoIndex];
        info = get.mock.calls[infoIndex][1] as any;
    });

    beforeEach(() => {
        account = {
            personId: USER.enviId, name: 'Jan', surname: 'Test',
            systemEmail: 'osoba@example.test', isActive: true,
            systemRoleName: 'ENVI_EMPLOYEE',
        };
        record = null;
        jest.spyOn(SbAccessRepository.prototype, 'getPersonAccount').mockImplementation(async () => account);
        jest.spyOn(SbAccessRepository.prototype, 'getByPersonId').mockImplementation(async () => record);
    });

    it('bramka całego prefiksu jest zarejestrowana przed trasą paczki', () => {
        expect(guard).toEqual(expect.any(Function));
        expect(guardOrder).toBeLessThan(packageOrder);
    });

    it.each([{}, { session: {} }])('bez sesji -> 401: %j', async (req) => {
        const res = makeRes();
        const next = jest.fn();
        await guard(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.send).toHaveBeenCalledWith({ errorMessage: 'Użytkownik niezalogowany' });
        expect(next).not.toHaveBeenCalled();
        expect(SbAccessRepository.prototype.getPersonAccount).not.toHaveBeenCalled();
    });

    it.each([
        [null, 'ENVI_EMPLOYEE', true, false],
        ['BLOCKED', 'ENVI_EMPLOYEE', true, false],
        ['REVOKED', 'ENVI_EMPLOYEE', true, false],
        [null, 'ADMIN', true, false],
        [null, 'ENVI_MANAGER', true, false],
        ['INVITED', 'ENVI_EMPLOYEE', true, true],
        ['ACTIVE', 'ENVI_EMPLOYEE', true, true],
        ['INVITED', 'ENVI_EMPLOYEE', false, false],
    ] as const)('stan %s, rola %s, konto aktywne %s -> dostęp %s', async (status, role, active, allowed) => {
        account!.isActive = active;
        account!.systemRoleName = role;
        if (status) record = {
            id: 1, personId: USER.enviId, statusCode: status,
            githubLogin: null, githubInvitationId: null, drivePermissionId: null,
            isGrantedManually: false, createdAt: new Date(), updatedAt: new Date(),
        };
        const res = makeRes();
        const next = jest.fn();
        await guard({ session: { userData: { ...USER, systemRoleName: role } } }, res, next);
        expect(SbAccessRepository.prototype.getPersonAccount).toHaveBeenCalledWith(USER.enviId);
        if (allowed) {
            expect(next).toHaveBeenCalledWith();
            expect(res.send).not.toHaveBeenCalled();
        } else {
            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.send).toHaveBeenCalledWith({ errorMessage: REFUSAL });
            expect(next).not.toHaveBeenCalled();
        }
    });

    it.each(['getPersonAccount', 'getByPersonId'] as const)('wyjątek z %s trafia przez kontroler do next(error)', async (method) => {
        const error = new Error('Błąd bazy');
        jest.spyOn(SbAccessRepository.prototype, method).mockRejectedValue(error);
        const res = makeRes();
        const next = jest.fn();
        await guard({ session: { userData: USER } }, res, next);
        expect(next).toHaveBeenCalledWith(error);
        expect(res.send).not.toHaveBeenCalled();
    });

    it('trasa info stoi za ta sama bramka prefiksu /sbInstaller co paczka', () => {
        expect(guardOrder).toBeLessThan(infoOrder);
    });

    it('info zwraca wersje z naglowka skryptu instalatora, bez cache`owania', () => {
        const res: any = { setHeader: jest.fn(), send: jest.fn() };

        info({ session: { userData: USER } }, res, jest.fn());

        const { version } = res.send.mock.calls[0][0];
        const cmd = fs.readFileSync(
            path.resolve(process.cwd(), 'assets', 'sb-installer', 'ENVI-SB-instalator.cmd'),
            'utf8'
        );
        expect(version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(cmd).toContain(`set "SB_INSTALATOR_WERSJA=${version}"`);
        expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    });
});
