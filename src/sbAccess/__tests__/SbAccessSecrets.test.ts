/// <reference types="jest" />
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { constants, generateKeyPairSync, privateDecrypt, webcrypto, KeyObject } from 'crypto';
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
    deviceTokenHash,
    displayFingerprint,
    expectedSecretNames,
    keyThumbprint,
    newDeviceToken,
    parseCiphertext,
    parsePublicKeyJwk,
} from '../sbSecretsPolicy';

const subtle = webcrypto.subtle;
const OAEP = { name: 'RSA-OAEP', hash: 'SHA-256' } as const;

/** Para kluczy jak w instalatorze: RSA 2048, e = 65537; klucz publiczny jako JWK. */
function keyPair() {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = publicKey.export({ format: 'jwk' }) as any;
    return { jwk: { kty: jwk.kty, n: jwk.n, e: jwk.e }, privateKey };
}
/** Szyfrowanie tak, jak robi to przeglądarka admina (WebCrypto RSA-OAEP SHA-256, base64). */
async function encryptLikeBrowser(jwk: any, plaintext: string): Promise<string> {
    const key = await subtle.importKey('jwk', { ...jwk, alg: 'RSA-OAEP-256', ext: true }, OAEP, false, ['encrypt']);
    const bytes = await subtle.encrypt(OAEP, key, new TextEncoder().encode(plaintext));
    return Buffer.from(bytes).toString('base64');
}
const decrypt = (privateKey: KeyObject, ciphertext: string) =>
    privateDecrypt(
        { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        Buffer.from(ciphertext, 'base64'),
    ).toString('utf8');

const A = keyPair();
const B = keyPair();
const LEVELS = { repos: 'read', psDb: 'ro', drive: 'none', mail: ['faktury'] } as const;
const record = (extra: any = {}) =>
    ({
        id: 1, personId: 131, statusCode: 'ACTIVE', githubLogin: null, githubInvitationId: null,
        drivePermissionId: null, isGrantedManually: false, levels: { ...LEVELS, mail: [...LEVELS.mail] },
        publicKeyJwk: A.jwk, createdAt: new Date(), updatedAt: new Date(), ...extra,
    }) as any;

describe('Hasła SB - reguły (bez bazy)', () => {
    it('migracja 004: klucz, token jako skrót, tabela szyfrogramów z unikalnością (PersonId, Name), cztery akcje', () => {
        const source = readFileSync(join(__dirname, '../migrations/004_sb_access_secrets.sql'), 'utf8')
            .replace(/--[^\r\n]*/g, '');
        for (const column of ['PublicKeyJwk JSON NULL', 'PublicKeySetAt DATETIME NULL', 'DeviceTokenHash CHAR(64) NULL', 'DeviceTokenIssuedAt DATETIME NULL'])
            expect(source).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
        expect(source).toContain('CREATE TABLE IF NOT EXISTS SbAccessSecrets (');
        expect(source).toMatch(/UNIQUE KEY \w+ \(PersonId, Name\)/);
        for (const action of ['SET_KEY', 'GIVE_SECRET', 'TAKE_SECRET', 'ISSUE_TOKEN'])
            expect(source).toContain(`'${action}'`);
        expect(source).not.toMatch(/UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP/i);
    });

    it('nazwy haseł wynikają z uprawnień: skrzynka -> poczta-<kod>, baza PS tylko gdy poziom != brak', () => {
        expect(expectedSecretNames({ repos: 'none', psDb: 'none', drive: 'none', mail: [] })).toEqual([]);
        expect(expectedSecretNames({ ...LEVELS, mail: ['faktury', 'marek'] })).toEqual(['poczta-faktury', 'poczta-marek', 'baza-ps']);
        // Odczyt i zapis bazy dają to samo jedno hasło (jedno wspólne konto agentów).
        expect(expectedSecretNames({ ...LEVELS, psDb: 'rw', mail: [] })).toEqual(['baza-ps']);
    });

    it('odcisk klucza = RFC 7638 (wektor z RFC 7638 rozdz. 3.1), na ekranie 8 znaków hex w dwóch grupach', () => {
        const rfc = {
            kty: 'RSA' as const, e: 'AQAB' as const,
            n: '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhMstn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5hajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw',
        };
        const hex = keyThumbprint(parsePublicKeyJwk(rfc));
        expect(Buffer.from(hex, 'hex').toString('base64url')).toBe('NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs');
        expect(displayFingerprint(hex)).toBe(`${hex.slice(0, 4)} ${hex.slice(4, 8)}`);
        expect(displayFingerprint(hex)).toMatch(/^[0-9a-f]{4} [0-9a-f]{4}$/);
    });

    it('klucz publiczny: przyjmuje RSA 2048 AQAB i zapisuje tylko kty/n/e', () => {
        expect(parsePublicKeyJwk({ ...A.jwk, alg: 'RSA-OAEP-256', ext: true, key_ops: ['encrypt'] })).toEqual(A.jwk);
    });

    it.each([
        ['EC', () => ({ ...A.jwk, kty: 'EC' })],
        ['inny wykładnik', () => ({ ...A.jwk, e: 'Aw' })],
        ['1024 bit', () => { const k = generateKeyPairSync('rsa', { modulusLength: 1024 }).publicKey.export({ format: 'jwk' }) as any; return { kty: 'RSA', n: k.n, e: k.e }; }],
        ['4096 bit', () => { const k = generateKeyPairSync('rsa', { modulusLength: 4096 }).publicKey.export({ format: 'jwk' }) as any; return { kty: 'RSA', n: k.n, e: k.e }; }],
        ['klucz prywatny', () => A.privateKey.export({ format: 'jwk' })],
        ['n nie base64url', () => ({ ...A.jwk, n: A.jwk.n.replace(/.$/, '+') })],
        ['brak', () => undefined],
        ['tekst', () => 'RSA'],
    ])('klucz publiczny odrzucony (400): %s', (_label, make) => {
        expect(() => parsePublicKeyJwk(make())).toThrow(SbAccessError);
    });

    it('próba pozytywna: szyfrogram z przeglądarki przechodzi walidację i otwiera go tylko właściwy klucz prywatny', async () => {
        const ciphertext = await encryptLikeBrowser(A.jwk, 'Haslo-Do-Poczty#2026');
        expect(parseCiphertext(ciphertext)).toBe(ciphertext);
        expect(Buffer.from(ciphertext, 'base64')).toHaveLength(256);
        expect(decrypt(A.privateKey, ciphertext)).toBe('Haslo-Do-Poczty#2026');
        // Kontrola negatywna: inny klucz prywatny nie odszyfrowuje.
        expect(() => decrypt(B.privateKey, ciphertext)).toThrow();
    });

    it.each([
        ['255 bajtów', Buffer.alloc(255, 1).toString('base64')],
        ['257 bajtów', Buffer.alloc(257, 1).toString('base64')],
        ['base64url', Buffer.alloc(256, 0xfb).toString('base64url')],
        ['bez dopełnienia', Buffer.alloc(256, 1).toString('base64').replace(/=+$/, '')],
        ['jawne hasło', 'Haslo-Do-Poczty#2026'],
        ['liczba', 42],
    ])('szyfrogram odrzucony (400): %s', (_label, value) => {
        expect(() => parseCiphertext(value)).toThrow(SbAccessError);
    });

    it('token urządzenia: 43 znaki base64url, w bazie skrót sha256 hex; śmieci nie dają skrótu', () => {
        const token = newDeviceToken();
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(deviceTokenHash(token)).toMatch(/^[0-9a-f]{64}$/);
        expect(deviceTokenHash(token)).not.toContain(token);
        expect(newDeviceToken()).not.toBe(token);
        for (const bad of [undefined, '', 'krotki', token + 'x', 123]) expect(deviceTokenHash(bad)).toBeNull();
    });
});

describe('Hasła SB - kontroler', () => {
    const conn = { threadId: 7 } as any;
    let append: any;
    let remove: any;
    let upsert: any;

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.spyOn(ToolsDb, 'transaction').mockImplementation(async (fn: any) => fn(conn));
        append = jest.spyOn(SbAccessEventRepository.prototype, 'append').mockResolvedValue(undefined);
        remove = jest.spyOn(SbAccessSecretRepository.prototype, 'remove').mockResolvedValue([]);
        upsert = jest.spyOn(SbAccessSecretRepository.prototype, 'upsert').mockResolvedValue(undefined);
        jest.spyOn(SbAccessRepository.prototype, 'getPersonAccount').mockResolvedValue({ personId: 131, isActive: true } as any);
    });

    it('ten sam klucz ponownie: bez zapisu, bez zdarzenia, szyfrogramy zostają', async () => {
        const setKey = jest.spyOn(SbAccessRepository.prototype, 'setPublicKey').mockResolvedValue(undefined);
        const out = await SbAccessController.setOwnPublicKey(record(), A.jwk as any);
        expect(out).toMatchObject({ changed: false, removedSecrets: 0, keyFingerprint: displayFingerprint(keyThumbprint(A.jwk as any)) });
        expect(setKey).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
        expect(append).not.toHaveBeenCalled();
    });

    it('zmiana klucza kasuje wszystkie szyfrogramy osoby i zapisuje SET_KEY z nowym odciskiem', async () => {
        const setKey = jest.spyOn(SbAccessRepository.prototype, 'setPublicKey').mockResolvedValue(undefined);
        remove.mockResolvedValue(['baza-ps', 'poczta-faktury']);
        const out = await SbAccessController.setOwnPublicKey(record(), B.jwk as any);
        const fp = displayFingerprint(keyThumbprint(B.jwk as any));
        expect(out).toMatchObject({ changed: true, removedSecrets: 2, keyFingerprint: fp });
        expect(setKey).toHaveBeenCalledWith(conn, 131, B.jwk);
        expect(remove).toHaveBeenCalledWith(conn, 131); // bez listy nazw = wszystkie
        const event = append.mock.calls[0][1] as any;
        expect(event).toMatchObject({ personId: 131, actionCode: 'SET_KEY', requestedByPersonId: 131 });
        expect(event.note).toContain(fp);
        expect(event.note).toContain('baza PS');
    });

    it('osoba bez klucza (pierwsza rejestracja) też dostaje SET_KEY', async () => {
        jest.spyOn(SbAccessRepository.prototype, 'setPublicKey').mockResolvedValue(undefined);
        const out = await SbAccessController.setOwnPublicKey(record({ publicKeyJwk: null }), A.jwk as any);
        expect(out.changed).toBe(true);
        expect((append.mock.calls[0][1] as any).actionCode).toBe('SET_KEY');
    });

    it('udostępnienie: zapis szyfrogramu pod blokadą wiersza, zdarzenie GIVE_SECRET bez szyfrogramu', async () => {
        const get = jest.spyOn(SbAccessRepository.prototype, 'getByPersonId').mockResolvedValue(record());
        const ciphertext = await encryptLikeBrowser(A.jwk, 'tajne');
        await SbAccessController.giveSecret(131, 'poczta-faktury', ciphertext, keyThumbprint(A.jwk as any), 1);
        expect(get).toHaveBeenCalledWith(131, conn, true);
        expect(upsert).toHaveBeenCalledWith(conn, 131, 'poczta-faktury', ciphertext, 1);
        const event = append.mock.calls[0][1] as any;
        expect(event).toMatchObject({ actionCode: 'GIVE_SECRET', requestedByPersonId: 1 });
        expect(event.note).not.toContain(ciphertext);
        expect(event.note).toContain('poczta faktury');
    });

    it.each([
        ['brak klucza', { publicKeyJwk: null }, 'poczta-faktury', 'A'],
        ['klucz zmieniony w międzyczasie', {}, 'poczta-faktury', 'B'],
        ['nazwa spoza uprawnień', {}, 'poczta-marek', 'A'],
        ['baza PS przy poziomie brak', { levels: { ...LEVELS, psDb: 'none' } }, 'baza-ps', 'A'],
        ['dostęp zablokowany', { statusCode: 'BLOCKED' }, 'poczta-faktury', 'A'],
    ])('udostępnienie odrzucone (409): %s', async (_label, extra, name, keyName) => {
        jest.spyOn(SbAccessRepository.prototype, 'getByPersonId').mockResolvedValue(record(extra));
        const thumbprint = keyThumbprint((keyName === 'A' ? A : B).jwk as any);
        await expect(
            SbAccessController.giveSecret(131, name, Buffer.alloc(256).toString('base64'), thumbprint, 1),
        ).rejects.toMatchObject({ status: 409 });
        expect(upsert).not.toHaveBeenCalled();
        expect(append).not.toHaveBeenCalled();
    });

    it('odebranie: usunięcie + TAKE_SECRET z przypomnieniem o zmianie hasła; nieudostępnione -> 404', async () => {
        remove.mockResolvedValue(['baza-ps']);
        await SbAccessController.takeSecret(131, 'baza-ps', 1);
        expect(remove).toHaveBeenCalledWith(conn, 131, ['baza-ps']);
        expect(append.mock.calls[0][1]).toMatchObject({ actionCode: 'TAKE_SECRET', requestedByPersonId: 1 });
        expect((append.mock.calls[0][1] as any).note).toMatch(/Zmień hasło źródłowe/);

        remove.mockResolvedValue([]);
        append.mockClear();
        await expect(SbAccessController.takeSecret(131, 'baza-ps', 1)).rejects.toMatchObject({ status: 404 });
        expect(append).not.toHaveBeenCalled();
    });

    it('zmiana uprawnień zabiera hasła, których nowe poziomy nie dają (TAKE_SECRET w tej samej transakcji)', async () => {
        jest.spyOn(SbAccessRepository.prototype, 'setLevels').mockResolvedValue(true);
        jest.spyOn(SbAccessRepository.prototype, 'getByPersonId').mockResolvedValue(record());
        jest.spyOn(SbAccessSecretRepository.prototype, 'listByPersonId').mockResolvedValue([
            { name: 'baza-ps' }, { name: 'poczta-faktury' },
        ] as any);
        remove.mockResolvedValue(['baza-ps']);
        await SbAccessController.setLevels(131, { ...LEVELS, psDb: 'none', mail: ['faktury'] } as any, 1);
        expect(remove).toHaveBeenCalledWith(conn, 131, ['baza-ps']);
        expect(append.mock.calls.map((call: any) => call[1].actionCode)).toEqual(['SET_LEVELS', 'TAKE_SECRET']);
    });

    it('lista rejestru: odcisk klucza i nazwy haseł (oczekiwane / udostępnione), nigdy szyfrogramy', async () => {
        jest.spyOn(SbAccessRepository.prototype, 'list').mockResolvedValue([record(), record({ personId: 5, publicKeyJwk: null })]);
        const names = jest.spyOn(SbAccessSecretRepository.prototype, 'listNames').mockResolvedValue([
            { personId: 131, name: 'poczta-faktury' }, { personId: 131, name: 'poczta-stara' }, { personId: 5, name: 'baza-ps' },
        ]);
        const [first, second] = await SbAccessController.list();
        expect(names).toHaveBeenCalled();
        expect(first).toMatchObject({
            keyFingerprint: displayFingerprint(keyThumbprint(A.jwk as any)),
            secretsExpected: ['poczta-faktury', 'baza-ps'],
            secretsGiven: ['poczta-faktury'],
        });
        expect(second).toMatchObject({ keyFingerprint: null, keyThumbprint: null });
        expect(JSON.stringify([first, second])).not.toMatch(/ciphertext/i);
    });

    it('własne szyfrogramy: tylko nazwy z bieżących uprawnień', async () => {
        jest.spyOn(SbAccessSecretRepository.prototype, 'listByPersonId').mockResolvedValue([
            { name: 'poczta-faktury', ciphertext: 'AAA', updatedAt: new Date(0) },
            { name: 'poczta-stara', ciphertext: 'BBB', updatedAt: new Date(0) },
        ] as any);
        const out = await SbAccessController.listOwnSecrets(record());
        expect(out.secrets.map((secret) => secret.name)).toEqual(['poczta-faktury']);
        expect(out.keyThumbprint).toBe(keyThumbprint(A.jwk as any));
    });

    it('tożsamość "me": sesja; ważny token; zły token 401; zablokowany 403', async () => {
        const byId = jest.spyOn(SbAccessRepository.prototype, 'getByPersonId').mockResolvedValue(record());
        const byToken = jest.spyOn(SbAccessRepository.prototype, 'getByDeviceTokenHash').mockResolvedValue(record({ personId: 131 }));
        expect((await SbAccessController.resolveSelf({ enviId: 131 } as any, undefined)).personId).toBe(131);
        expect(byId).toHaveBeenCalledWith(131);

        const token = newDeviceToken();
        expect((await SbAccessController.resolveSelf(undefined, token)).personId).toBe(131);
        expect(byToken).toHaveBeenCalledWith(deviceTokenHash(token)!);

        await expect(SbAccessController.resolveSelf(undefined, 'zly')).rejects.toMatchObject({ status: 401 });
        byToken.mockResolvedValue(null);
        await expect(SbAccessController.resolveSelf(undefined, token)).rejects.toMatchObject({ status: 401 });
        byToken.mockResolvedValue(record({ statusCode: 'BLOCKED' }));
        await expect(SbAccessController.resolveSelf(undefined, token)).rejects.toMatchObject({ status: 403 });
    });

    it('wydanie tokenu: w bazie skrót, zdarzenie ISSUE_TOKEN bez tokenu', async () => {
        const set = jest.spyOn(SbAccessRepository.prototype, 'setDeviceTokenHash').mockResolvedValue(true);
        const token = await SbAccessController.issueDeviceToken(131);
        expect(set).toHaveBeenCalledWith(conn, 131, deviceTokenHash(token)!);
        expect(JSON.stringify(append.mock.calls)).not.toContain(token);
        expect(append.mock.calls[0][1]).toMatchObject({ actionCode: 'ISSUE_TOKEN', personId: 131 });
    });
});

describe('Hasła SB - repozytoria i logi', () => {
    beforeEach(() => { jest.restoreAllMocks(); });

    it('zapis szyfrogramu nie idzie przez executeSQL (ten loguje parametry), a błąd bazy nie niesie treści zapytania', async () => {
        const execute = jest.spyOn(ToolsDb, 'executeSQL');
        const query = jest.spyOn(ToolsDb, 'getQueryCallbackAsync').mockResolvedValue({} as any);
        const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
        const repo = new SbAccessSecretRepository();
        const ciphertext = Buffer.alloc(256, 7).toString('base64');
        await repo.upsert({} as any, 131, 'baza-ps', ciphertext, 1);
        expect(execute).not.toHaveBeenCalled();
        expect(query.mock.calls[0][2]).toEqual([131, 'baza-ps', ciphertext, 1]);
        expect(JSON.stringify(log.mock.calls)).not.toContain(ciphertext);

        const dbError: any = new Error(`Duplicate entry ... ${ciphertext}`);
        dbError.code = 'ER_SOMETHING';
        dbError.sql = `INSERT ... '${ciphertext}'`;
        query.mockRejectedValue(dbError);
        const failure = await repo.upsert({} as any, 131, 'baza-ps', ciphertext, 1).catch((error) => error);
        expect(String(failure.message)).not.toContain(ciphertext);
        expect(failure.sql).toBeUndefined();
    });

    it('blokada i odebranie dostępu kasują token urządzenia', async () => {
        const execute = jest.spyOn(ToolsDb, 'executeSQL').mockResolvedValue({} as any);
        jest.spyOn(ToolsDb, 'getQueryCallbackAsync').mockResolvedValue([{ Id: 1 }] as any);
        const repo = new SbAccessRepository();
        await repo.upsertState({} as any, { personId: 131, statusCode: 'BLOCKED' });
        expect(execute.mock.calls[0][0]).toContain('DeviceTokenHash = ?');
        execute.mockClear();
        await repo.upsertState({} as any, { personId: 131, statusCode: 'ACTIVE' });
        expect(execute.mock.calls[0][0]).not.toContain('DeviceTokenHash');
    });
});

describe('Hasła SB - trasy', () => {
    const routes: { method: string; path: string; handler: any }[] = [];
    let guard: any;
    const makeRes = () => {
        const res: any = {};
        res.status = jest.fn().mockReturnValue(res);
        res.send = jest.fn().mockReturnValue(res);
        res.setHeader = jest.fn();
        return res;
    };
    const route = (method: string, path: string) => routes.find((r) => r.method === method && r.path === path)!.handler;

    beforeAll(() => {
        require('../SbAccessRouters');
        for (const method of ['get', 'post', 'put', 'delete'] as const)
            ((app as any)[method] as jest.Mock).mock.calls.forEach((call: any) =>
                routes.push({ method, path: call[0], handler: call[1] }),
            );
        const use = app.use as unknown as jest.Mock;
        guard = use.mock.calls.find((call: any) => call[0] === '/sbAccess')![1];
    });
    beforeEach(() => {
        jest.restoreAllMocks();
        mockHasFlag.mockReset();
    });

    it('PUT me/publicKey: osoba z sesji, personId z treści żądania ignorowany', async () => {
        const resolve = jest.spyOn(SbAccessController, 'resolveSelf').mockResolvedValue(record());
        const set = jest.spyOn(SbAccessController, 'setOwnPublicKey').mockResolvedValue({ changed: true } as any);
        const res = makeRes();
        await route('put', '/sbAccess/me/publicKey')(
            { session: { userData: { enviId: 131 } }, headers: {}, parsedBody: { publicKeyJwk: A.jwk, personId: 5 } },
            res, jest.fn(),
        );
        expect(resolve).toHaveBeenCalledWith({ enviId: 131 } as any, undefined);
        expect(set).toHaveBeenCalledWith(expect.objectContaining({ personId: 131 }), A.jwk);
    });

    it('PUT me/publicKey bez sesji i bez tokenu -> 401; token z nagłówka trafia do rozstrzygnięcia osoby', async () => {
        let res = makeRes();
        await route('put', '/sbAccess/me/publicKey')({ session: {}, headers: {}, parsedBody: { publicKeyJwk: A.jwk } }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);

        const resolve = jest.spyOn(SbAccessController, 'resolveSelf').mockResolvedValue(record());
        jest.spyOn(SbAccessController, 'listOwnSecrets').mockResolvedValue({ secrets: [] } as any);
        res = makeRes();
        await route('get', '/sbAccess/me/secrets')({ session: {}, headers: { 'x-envi-sb-device-token': 'T' } }, res, jest.fn());
        expect(resolve).toHaveBeenCalledWith(undefined, 'T');
        expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    });

    it('PUT me/publicKey z kluczem prywatnym -> 400 i nic nie zapisane', async () => {
        jest.spyOn(SbAccessController, 'resolveSelf').mockResolvedValue(record());
        const set = jest.spyOn(SbAccessController, 'setOwnPublicKey');
        const res = makeRes();
        await route('put', '/sbAccess/me/publicKey')(
            { session: { userData: { enviId: 131 } }, headers: {}, parsedBody: { publicKeyJwk: A.privateKey.export({ format: 'jwk' }) } },
            res, jest.fn(),
        );
        expect(res.status).toHaveBeenCalledWith(400);
        expect(set).not.toHaveBeenCalled();
    });

    it('nie-admin nie udostępnia hasła: bramka odpowiada 403 przed trasą', async () => {
        jest.spyOn(SbAccessRepository.prototype, 'getPersonAccount').mockResolvedValue({ personId: 131, isActive: true, systemRoleName: 'ENVI_EMPLOYEE' } as any);
        mockHasFlag.mockResolvedValue(true);
        const res = makeRes();
        const next = jest.fn();
        await guard({ session: { userData: { enviId: 131, systemRoleName: 'ENVI_EMPLOYEE' } } }, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('PUT :personId/secrets/:name: walidacja szyfrogramu i odcisku, zlecający z sesji', async () => {
        const give = jest.spyOn(SbAccessController, 'giveSecret').mockResolvedValue({ name: 'baza-ps', given: true });
        const handler = route('put', '/sbAccess/:personId/secrets/:name');
        const ciphertext = await encryptLikeBrowser(A.jwk, 'x');
        const thumbprint = keyThumbprint(A.jwk as any);
        const req = (body: any) => ({ session: { userData: { enviId: 1 } }, params: { personId: '131', name: 'baza-ps' }, parsedBody: body });

        let res = makeRes();
        await handler(req({ ciphertext: 'jawne-haslo', keyThumbprint: thumbprint }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        res = makeRes();
        await handler(req({ ciphertext }), res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(give).not.toHaveBeenCalled();

        res = makeRes();
        await handler(req({ ciphertext, keyThumbprint: thumbprint }), res, jest.fn());
        expect(give).toHaveBeenCalledWith(131, 'baza-ps', ciphertext, thumbprint, 1);
    });

    it('DELETE :personId/secrets/:name: zła nazwa -> 400, poprawna -> odebranie', async () => {
        const take = jest.spyOn(SbAccessController, 'takeSecret').mockResolvedValue({ name: 'baza-ps', given: false });
        const handler = route('delete', '/sbAccess/:personId/secrets/:name');
        let res = makeRes();
        await handler({ session: { userData: { enviId: 1 } }, params: { personId: '131', name: '../x' } }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        res = makeRes();
        await handler({ session: { userData: { enviId: 1 } }, params: { personId: '131', name: 'baza-ps' } }, res, jest.fn());
        expect(take).toHaveBeenCalledWith(131, 'baza-ps', 1);
    });
});
