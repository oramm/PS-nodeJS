/// <reference types="jest" />
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

jest.mock('../../index', () => ({
    app: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(), use: jest.fn() },
}));
jest.mock('../../staff/StaffMemberRepository', () => ({
    __esModule: true,
    default: { hasSbAccessManagement: jest.fn() },
}));
jest.mock('../../persons/PersonsController', () => ({
    __esModule: true,
    default: { getPersonFromSessionUserData: jest.fn() },
}));
jest.mock('../../letters/letterEvent/LetterEventsController', () => ({
    __esModule: true,
    default: { addNew: jest.fn() },
}));

import ToolsDb from '../../tools/ToolsDb';
import SbAccessController from '../SbAccessController';
import SbAccessEventRepository from '../SbAccessEventRepository';
import SbAccessRepository from '../SbAccessRepository';
import sbAgentKeyAuth from '../sbAgentKeyAuth';
import denyDestructiveForAgent from '../../setup/Sessions/denyDestructiveForAgent';
import requireSession from '../../setup/Sessions/requireSession';
import { SbAccessError } from '../sbAccessPolicy';
import { newDeviceToken, parseAgentKeyHash } from '../sbSecretsPolicy';
import Letter from '../../letters/Letter';
import PersonsController from '../../persons/PersonsController';
import LetterEventsController from '../../letters/letterEvent/LetterEventsController';

const KEY = newDeviceToken();
const KEY_HASH = createHash('sha256').update(KEY, 'utf8').digest('hex');

const AGNIESZKA = {
    personId: 140,
    systemEmail: 'a.brodziak@envi.com.pl',
    name: 'Agnieszka',
    surname: 'Brodziak',
    systemRoleId: 3,
    systemRoleName: 'ENVI_EMPLOYEE',
};
const HUMAN = {
    enviId: 125, systemEmail: 'oramwp@gmail.com', userName: 'Marek Gazda', picture: '',
    systemRoleName: 'ADMIN', systemRoleId: 1,
} as any;

// jest.config: restoreMocks = true, więc szpieg powstaje na nowo przed każdym testem.
let getAgent: any;

function request(method: string, path: string, params: { key?: string; userData?: any } = {}) {
    const req: any = {
        method, path, ip: '::1',
        headers: params.key ? { 'x-envi-sb-agent-key': params.key } : {},
        session: { userData: params.userData, cookie: { maxAge: 1 } },
    };
    const res: any = { locals: {}, statusCode: 200, body: undefined };
    res.status = (code: number) => ((res.statusCode = code), res);
    res.send = (body: any) => ((res.body = body), res);
    return { req, res };
}

/** Kolejność jak w src/index.ts: klucz osoby -> zakaz kasowania -> wymóg sesji -> trasa. */
async function chain(method: string, path: string, params: { key?: string; userData?: any } = {}) {
    const { req, res } = request(method, path, params);
    let reachedRoute = false;
    await sbAgentKeyAuth(req, res, () => {
        denyDestructiveForAgent(req, res, () => {
            requireSession(req, res, () => {
                reachedRoute = true;
            });
        });
    });
    return { reachedRoute, status: reachedRoute ? 200 : res.statusCode, req, res };
}

beforeEach(() => {
    getAgent = jest
        .spyOn(SbAccessRepository.prototype, 'getAgentByKeyHash')
        .mockResolvedValue({ ...AGNIESZKA, psDb: 'rw' } as any);
});

describe('SBZ-1: migracje (bez bazy)', () => {
    const sql = (path: string) =>
        readFileSync(join(__dirname, '../..', path), 'utf8').replace(/--[^\r\n]*/g, '');

    it('007: skrót klucza CHAR(64) UNIQUE, czas rejestracji, akcja w historii, bez zmian danych', () => {
        const source = sql('sbAccess/migrations/007_sb_access_agent_key.sql');
        expect(source).toContain('ADD COLUMN IF NOT EXISTS AgentKeyHash CHAR(64) NULL');
        expect(source).toContain('ADD COLUMN IF NOT EXISTS AgentKeySetAt DATETIME NULL');
        expect(source).toContain('ADD UNIQUE KEY IF NOT EXISTS uq_sbaccess_agentkeyhash (AgentKeyHash)');
        expect(source).toContain("('SET_AGENT_KEY',");
        expect(source).not.toMatch(/UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP/i);
    });

    it('letters 005: znak agenta przy zdarzeniu pisma, domyślnie 0', () => {
        const source = sql('letters/migrations/005_letter_events_by_agent.sql');
        expect(source).toContain('ADD COLUMN IF NOT EXISTS IsByAgent TINYINT(1) NOT NULL DEFAULT 0');
        expect(source).not.toMatch(/UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP/i);
    });
});

describe('SBZ-1: wejście kluczem osoby (warstwy jak w index.ts)', () => {
    it('zapis pisma kluczem osoby: trasa osiągnięta jako ta osoba ze znakiem agenta', async () => {
        const result = await chain('POST', '/letterReact', { key: KEY });
        expect(result.reachedRoute).toBe(true);
        expect(getAgent).toHaveBeenCalledWith(KEY_HASH);
        expect(result.req.session.userData).toMatchObject({
            enviId: 140,
            systemEmail: 'a.brodziak@envi.com.pl',
            isPersonAgent: true,
        });
        expect(result.res.locals.authenticatedMachine).toBe(true);
    });

    it('edycja kontraktu (PUT /contract/:id) przechodzi', async () => {
        expect((await chain('PUT', '/contract/77', { key: KEY })).reachedRoute).toBe(true);
    });

    it('poziom "baza PS: odczyt" = 403, bez tożsamości', async () => {
        getAgent.mockResolvedValue({ ...AGNIESZKA, psDb: 'ro' });
        const result = await chain('POST', '/letterReact', { key: KEY });
        expect(result.status).toBe(403);
        expect(result.req.session.userData).toBeUndefined();
    });

    it('blokada (wpis nie ACTIVE albo skrót skasowany) = 401', async () => {
        getAgent.mockResolvedValue(null);
        expect((await chain('POST', '/letterReact', { key: KEY })).status).toBe(401);
    });

    it('klucz w złym formacie nie pyta bazy i daje 401', async () => {
        expect((await chain('POST', '/letterReact', { key: 'x' })).status).toBe(401);
        expect(getAgent).not.toHaveBeenCalled();
    });

    it('DELETE = 403 (ta sama blokada co dla agenta właściciela)', async () => {
        expect((await chain('DELETE', '/letter/6163', { key: KEY })).status).toBe(403);
    });

    it('POST /contractReact = 403 (na start bez zakładania kontraktów)', async () => {
        expect((await chain('POST', '/contractReact', { key: KEY })).status).toBe(403);
        expect((await chain('POST', '/ContractReact/', { key: KEY })).status).toBe(403);
    });

    it('agent nie sięga /sbAccess (własne klucze, poziomy)', async () => {
        expect((await chain('PUT', '/sbAccess/me/agentKey', { key: KEY })).status).toBe(403);
        expect((await chain('PUT', '/sbAccess/140/levels', { key: KEY })).status).toBe(403);
    });

    it('człowiek w przeglądarce: warstwa nic nie robi, może zakładać kontrakty', async () => {
        const result = await chain('POST', '/contractReact', { key: KEY, userData: HUMAN });
        expect(result.reachedRoute).toBe(true);
        expect(result.req.session.userData).toBe(HUMAN);
        expect(getAgent).not.toHaveBeenCalled();
    });

    it('ciasteczko agenta bez klucza traci tożsamość (401)', async () => {
        const first = await chain('POST', '/letterReact', { key: KEY });
        const stale = first.req.session.userData;
        const result = await chain('POST', '/letterReact', { userData: stale });
        expect(result.status).toBe(401);
        expect(result.req.session.userData).toBeUndefined();
    });

    it('awaria bazy nie przepuszcza tożsamości', async () => {
        getAgent.mockRejectedValue(new Error('db down'));
        const errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        expect((await chain('POST', '/letterReact', { key: KEY })).status).toBe(401);
        errorLog.mockRestore();
    });
});

describe('SBZ-1: tożsamość z bazy', () => {
    it('zapytanie wymaga ACTIVE i aktywnego konta, poziom z Levels', async () => {
        getAgent.mockRestore();
        const query = jest
            .spyOn(ToolsDb, 'getQueryCallbackAsync')
            .mockResolvedValue([{ ...AGNIESZKA, levels: JSON.stringify({ repos: 'none', psDb: 'ro', drive: 'none', mail: [] }) }] as any);
        const agent = await new SbAccessRepository().getAgentByKeyHash(KEY_HASH);
        expect(agent).toMatchObject({ personId: 140, psDb: 'ro' });
        const [sqlText, , params] = query.mock.calls[0] as any[];
        expect(sqlText).toContain("s.StatusCode = 'ACTIVE'");
        expect(sqlText).toContain('pa.IsActive = 1');
        expect(sqlText).toContain('s.AgentKeyHash = ?');
        expect(params).toEqual([KEY_HASH]);
        query.mockResolvedValue([] as any);
        expect(await new SbAccessRepository().getAgentByKeyHash(KEY_HASH)).toBeNull();
        query.mockRestore();
    });
});

describe('SBZ-1: PUT /sbAccess/me/agentKey', () => {
    const record = { personId: 140, statusCode: 'ACTIVE' } as any;

    it('przyjmuje tylko skrót (64 hex), nie sam klucz', () => {
        expect(parseAgentKeyHash(KEY_HASH)).toBe(KEY_HASH);
        expect(() => parseAgentKeyHash(KEY)).toThrow(SbAccessError);
        expect(() => parseAgentKeyHash(KEY_HASH.toUpperCase())).toThrow(SbAccessError);
        expect(() => parseAgentKeyHash(undefined)).toThrow(SbAccessError);
    });

    it('nowy skrót: zapis + zdarzenie SET_AGENT_KEY; ten sam skrót: bez zmian; zajęty: 409', async () => {
        const transaction = jest.spyOn(ToolsDb, 'transaction').mockImplementation(async (cb: any) => cb({}));
        const getHash = jest.spyOn(SbAccessRepository.prototype, 'getAgentKeyHash').mockResolvedValue(null);
        const setHash = jest.spyOn(SbAccessRepository.prototype, 'setAgentKeyHash').mockResolvedValue(true);
        const append = jest.spyOn(SbAccessEventRepository.prototype, 'append').mockResolvedValue(undefined as any);

        expect(await SbAccessController.setOwnAgentKey(record, KEY_HASH)).toEqual({ changed: true });
        expect(setHash).toHaveBeenCalledWith({} as any, 140, KEY_HASH);
        expect(append).toHaveBeenCalledWith({} as any, expect.objectContaining({ personId: 140, actionCode: 'SET_AGENT_KEY' }));

        getHash.mockResolvedValue(KEY_HASH);
        append.mockClear();
        expect(await SbAccessController.setOwnAgentKey(record, KEY_HASH)).toEqual({ changed: false });
        expect(append).not.toHaveBeenCalled();

        getHash.mockResolvedValue(null);
        setHash.mockResolvedValue(false);
        await expect(SbAccessController.setOwnAgentKey(record, KEY_HASH)).rejects.toMatchObject({ status: 409 });

        for (const spy of [transaction, getHash, setHash, append]) spy.mockRestore();
    });

    it('trasa jest dla instalatora bez sesji (lista requireSession) i stoi nad bramką /sbAccess', async () => {
        const { req, res } = request('PUT', '/sbAccess/me/agentKey');
        let passed = false;
        requireSession(req, res, () => (passed = true));
        expect(passed).toBe(true);
        const { app } = jest.requireMock('../../index') as any;
        jest.isolateModules(() => require('../SbAccessRouters'));
        const order = [...app.put.mock.invocationCallOrder];
        const putIndex = app.put.mock.calls.findIndex((c: any[]) => c[0] === '/sbAccess/me/agentKey');
        const guardIndex = app.use.mock.calls.findIndex((c: any[]) => c[0] === '/sbAccess');
        expect(putIndex).toBeGreaterThanOrEqual(0);
        expect(order[putIndex]).toBeLessThan(app.use.mock.invocationCallOrder[guardIndex]);
    });
});

describe('SBZ-1: historia pisma — autor = osoba, znak agenta', () => {
    const person = { id: 140, name: 'Agnieszka', surname: 'Brodziak' };

    it('zdarzenie utworzenia pisma agenta osoby niesie isByAgent = 1, człowieka nie', async () => {
        (PersonsController.getPersonFromSessionUserData as jest.Mock<any>).mockResolvedValue(person);
        const letter: any = { id: 6200 };

        await Letter.prototype.createNewLetterEvent.call(letter, {
            ...HUMAN, enviId: 140, isPersonAgent: true,
        });
        const agentEvent = (LetterEventsController.addNew as jest.Mock).mock.calls[0][0] as any;
        expect(agentEvent._editor).toBe(person);
        expect(agentEvent.isByAgent).toBe(1);

        await Letter.prototype.createNewLetterEvent.call(letter, HUMAN);
        const humanEvent = (LetterEventsController.addNew as jest.Mock).mock.calls[1][0] as any;
        expect(humanEvent.isByAgent).toBeUndefined();
    });
});
