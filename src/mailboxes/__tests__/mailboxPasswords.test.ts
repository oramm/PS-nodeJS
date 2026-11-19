/**
 * SKO-2: PS wylicza, wydaje i zmienia hasła skrzynek zarządzanych. Atrapy bazy i serwera poczty (stan w pamięci);
 * prawdziwe: reguła dostępu, wyprowadzenie hasła, szyfrowanie kluczem komputera.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { constants, generateKeyPairSync, KeyObject, privateDecrypt } from 'crypto';
import { inspect } from 'util';

jest.mock('../../index', () => ({ app: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(), use: jest.fn() } }));

import { app } from '../../index';
import ToolsDb from '../../tools/ToolsDb';
import SbAccessController from '../../sbAccess/SbAccessController';
import SbAccessRepository from '../../sbAccess/SbAccessRepository';
import SbAccessSecretRepository from '../../sbAccess/SbAccessSecretRepository';
import SbAccessEventRepository from '../../sbAccess/SbAccessEventRepository';
import ToolsMail from '../../tools/ToolsMail';
import { encryptForComputer, parseCiphertext } from '../../sbAccess/sbSecretsPolicy';
import MailboxRepository, { MailboxRecord } from '../MailboxRepository';
import DirectAdminGateway from '../directAdminGateway';
import { MailboxAssigneeRow } from '../mailboxAccessPolicy';
import MailboxPasswordService, { mailboxPassword, passwordsManaged } from '../MailboxPasswordService';
import MailboxController from '../MailboxController';

const SECRET = 'test-secret-'.padEnd(40, 'x');

function keyPair() {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = publicKey.export({ format: 'jwk' }) as any;
    return { jwk: { kty: 'RSA', n: jwk.n, e: 'AQAB' } as any, privateKey };
}
const decrypt = (privateKey: KeyObject, ciphertext: string) =>
    privateDecrypt({ key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(ciphertext, 'base64')).toString('utf8');
const A = keyPair();

const mailbox = (id: number, code: string, extra: Partial<MailboxRecord> = {}): MailboxRecord => ({
    id, code, address: `${code}@envi.com.pl`, projectId: 10 + id, contractId: null, statusCode: 'ACTIVE',
    agentCopyStatus: 'NONE', agentCopyLastError: null, passwordVersion: 1, allEmployees: false, ...extra,
});

describe('SKO-2 hasła skrzynek zarządzanych', () => {
    let mailboxes: MailboxRecord[];
    let rows: MailboxAssigneeRow[];
    let secrets: { personId: number; name: string; ciphertext: string; sharedByPersonId: number | null }[];
    let holders: { mailboxId: number; personId: number; version: number }[];
    let people: Record<number, { role: string; isActive: boolean; statusCode: string; mail: string[]; publicKeyJwk: any }>;
    let server: Record<string, string>;
    let logs: jest.SpiedFunction<any>[];
    let handlers: Record<string, any>;
    let events: jest.SpiedFunction<typeof SbAccessEventRepository.prototype.append>;
    let reports: jest.SpiedFunction<typeof ToolsMail.sendServerErrorReport>;
    const original = process.env.MAILBOX_PASSWORD_SECRET;

    beforeAll(() => {
        require('../MailboxRouters');
        handlers = {};
        for (const method of ['get', 'post', 'put'] as const)
            for (const [path, handler] of (app[method] as jest.Mock<any>).mock.calls) handlers[`${method} ${path}`] = handler;
    });

    beforeEach(() => {
        jest.restoreAllMocks();
        process.env.MAILBOX_PASSWORD_SECRET = SECRET;
        mailboxes = [];
        rows = [];
        secrets = [];
        holders = [];
        server = {};
        people = {};
        logs = ['log', 'warn', 'error', 'info', 'debug'].map((m) => jest.spyOn(console, m as 'log').mockImplementation(() => undefined));
        const byId = (id: number) => mailboxes.find((m) => m.id === id);
        jest.spyOn(ToolsDb, 'transaction').mockImplementation(async (fn: any) => fn({}));
        jest.spyOn(MailboxRepository.prototype, 'find').mockImplementation(async () => mailboxes.map((m) => ({ ...m })));
        jest.spyOn(MailboxRepository.prototype, 'get').mockImplementation(async (id: number) => byId(id) && { ...byId(id)! });
        jest.spyOn(MailboxRepository.prototype, 'findWithAssignees').mockImplementation(async () => rows);
        jest.spyOn(MailboxRepository.prototype, 'holderVersions').mockImplementation(async (personId: number) =>
            new Map(holders.filter((h) => h.personId === personId).map((h) => [h.mailboxId, h.version])));
        jest.spyOn(MailboxRepository.prototype, 'holders').mockImplementation(async () => holders.map((h) => ({
            ...h, statusCode: people[h.personId]?.statusCode ?? null, isActive: !!people[h.personId]?.isActive,
            systemRoleName: people[h.personId]?.role ?? null, manualCodes: people[h.personId]?.mail ?? [],
        })));
        jest.spyOn(MailboxRepository.prototype, 'setHolder').mockImplementation(async (_c, mailboxId: number, personId: number, version: number) => {
            holders = [...holders.filter((h) => h.mailboxId !== mailboxId || h.personId !== personId), { mailboxId, personId, version }];
        });
        jest.spyOn(MailboxRepository.prototype, 'setPasswordVersion').mockImplementation(async (id: number, version: number) => {
            byId(id)!.passwordVersion = version;
            holders = holders.filter((h) => h.mailboxId !== id || h.version >= version);
        });
        jest.spyOn(MailboxRepository.prototype, 'setAgentCopyState').mockImplementation(async (id: number, agentCopyStatus: any, agentCopyLastError: any) => {
            Object.assign(byId(id)!, { agentCopyStatus, agentCopyLastError });
        });
        jest.spyOn(SbAccessSecretRepository.prototype, 'listByPersonId').mockImplementation(async (personId: number) =>
            secrets.filter((s) => s.personId === personId) as any);
        jest.spyOn(SbAccessSecretRepository.prototype, 'upsert').mockImplementation(async (_c, personId, name, ciphertext, sharedByPersonId) => {
            secrets = [...secrets.filter((s) => s.personId !== personId || s.name !== name), { personId, name, ciphertext, sharedByPersonId }];
        });
        jest.spyOn(SbAccessSecretRepository.prototype, 'removeByName').mockImplementation(async (_c, name) => {
            secrets = secrets.filter((s) => s.name !== name);
        });
        jest.spyOn(SbAccessRepository.prototype, 'getPersonAccount').mockImplementation(async (personId: number) =>
            ({ personId, isActive: people[personId]?.isActive, systemRoleName: people[personId]?.role }) as any);
        jest.spyOn(SbAccessRepository.prototype, 'getByPersonId').mockImplementation(async (personId: number) =>
            people[personId] && ({ personId, statusCode: people[personId].statusCode, publicKeyJwk: people[personId].publicKeyJwk,
                levels: { repos: 'none', psDb: 'none', drive: 'none', mail: people[personId].mail } }) as any);
        jest.spyOn(DirectAdminGateway, 'changePassword').mockImplementation(async (address, password) => { server[address] = password; });
        jest.spyOn(DirectAdminGateway, 'removeAgentCopy').mockResolvedValue(undefined);
        events = jest.spyOn(SbAccessEventRepository.prototype, 'append').mockResolvedValue(undefined);
        reports = jest.spyOn(ToolsMail, 'sendServerErrorReport').mockResolvedValue(undefined as any);
    });

    afterEach(() => {
        // Żadne hasło skrzynki nie trafia do console.*, historii Dostępów SB ani zgłoszeń.
        const logged = inspect([logs.map((log) => log.mock.calls), events.mock.calls, reports.mock.calls], { depth: 10 });
        for (const password of Object.values(server)) expect(logged).not.toContain(password);
        if (original === undefined) delete process.env.MAILBOX_PASSWORD_SECRET;
        else process.env.MAILBOX_PASSWORD_SECRET = original;
    });

    const person = (id: number, role: string, extra: Partial<(typeof people)[number]> = {}) => {
        people[id] = { role, isActive: true, statusCode: 'ACTIVE', mail: [], publicKeyJwk: A.jwk, ...extra };
        return { personId: id, statusCode: people[id].statusCode, publicKeyJwk: people[id].publicKeyJwk,
            levels: { repos: 'none', psDb: 'none', drive: 'none', mail: people[id].mail } } as any;
    };
    const row = (m: MailboxRecord, personId: number | null = null): MailboxAssigneeRow =>
        ({ code: m.code, address: m.address, personId, owned: m.projectId != null || m.contractId != null, allEmployees: !!m.allEmployees, passwordVersion: m.passwordVersion ?? null });

    describe('wyprowadzenie i szyfrowanie', () => {
        it('hasło = 48 znaków hex, stałe dla kodu i wersji, inne dla innego kodu, wersji i sekretu', () => {
            const first = mailboxPassword('proj', 1);
            expect(first).toMatch(/^[0-9a-f]{48}$/);
            expect(mailboxPassword('proj', 1)).toBe(first);
            expect(mailboxPassword('proj', 2)).not.toBe(first);
            expect(mailboxPassword('inna', 1)).not.toBe(first);
            process.env.MAILBOX_PASSWORD_SECRET = 'inny-sekret-'.padEnd(40, 'y');
            expect(mailboxPassword('proj', 1)).not.toBe(first);
        });

        it.each([undefined, '', 'za-krotki'])('sekret %j = PS nie zarządza hasłami', (value) => {
            if (value === undefined) delete process.env.MAILBOX_PASSWORD_SECRET;
            else process.env.MAILBOX_PASSWORD_SECRET = value;
            expect(passwordsManaged()).toBe(false);
            expect(() => mailboxPassword('proj', 1)).toThrow('nie są skonfigurowane');
        });

        it('szyfrogram kluczem komputera przechodzi parseCiphertext i odszyfrowuje się kluczem prywatnym', () => {
            const ciphertext = encryptForComputer(A.jwk, 'HasloSkrzynki123');
            expect(parseCiphertext(ciphertext)).toBe(ciphertext);
            expect(decrypt(A.privateKey, ciphertext)).toBe('HasloSkrzynki123');
        });
    });

    describe('wydanie hasła komputerowi', () => {
        it('nowe -> szyfrogram od PS i posiadacz; istniejące -> bez zapisu; starsza wersja -> nowy szyfrogram', async () => {
            const proj = mailbox(1, 'proj');
            mailboxes = [proj, mailbox(2, 'stara', { passwordVersion: null }), mailbox(3, 'faktury', { projectId: null, passwordVersion: null })];
            rows = mailboxes.map((m) => row(m));
            const employee = person(5, 'ENVI_EMPLOYEE');
            await MailboxPasswordService.issue(employee);
            expect(secrets).toEqual([expect.objectContaining({ personId: 5, name: 'poczta-proj', sharedByPersonId: null })]);
            expect(decrypt(A.privateKey, secrets[0].ciphertext)).toBe(mailboxPassword('proj', 1));
            expect(holders).toEqual([{ mailboxId: 1, personId: 5, version: 1 }]);
            // jeden wpis w historii Dostępów SB: liczba i kody, system jako zlecający, bez szyfrogramu
            expect(events).toHaveBeenCalledTimes(1);
            expect(events.mock.calls[0][1]).toEqual({ personId: 5, actionCode: 'GIVE_SECRET', resultCode: 'OK', requestedByPersonId: null,
                note: 'PS wydał komputerowi hasła skrzynek (1): proj.' });
            expect(inspect(events.mock.calls)).not.toContain(secrets[0].ciphertext);

            const upsert = SbAccessSecretRepository.prototype.upsert as jest.Mock;
            upsert.mockClear();
            await MailboxPasswordService.issue(employee);
            expect(upsert).not.toHaveBeenCalled();
            expect(events).toHaveBeenCalledTimes(1);

            mailboxes[0].passwordVersion = 2;
            await MailboxPasswordService.issue(employee);
            expect(decrypt(A.privateKey, secrets[0].ciphertext)).toBe(mailboxPassword('proj', 2));
            expect(holders).toEqual([{ mailboxId: 1, personId: 5, version: 2 }]);

            // szyfrogram skasowany przez przepływ SB (np. zmiana poziomów), posiadacz został -> wydanie ponownie
            secrets = [];
            await MailboxPasswordService.issue(employee);
            expect(secrets.map((s) => s.name)).toEqual(['poczta-proj']);
        });

        it('bez sekretu, bez klucza komputera albo bez prawa do skrzynki - nic nie wydaje', async () => {
            mailboxes = [mailbox(1, 'proj')];
            rows = [row(mailboxes[0])];
            await MailboxPasswordService.issue(person(7, 'ENVI_COOPERATOR'));
            await MailboxPasswordService.issue(person(5, 'ENVI_EMPLOYEE', { publicKeyJwk: null }));
            delete process.env.MAILBOX_PASSWORD_SECRET;
            await MailboxPasswordService.issue(person(6, 'ENVI_EMPLOYEE'));
            expect(secrets).toEqual([]);
            expect(holders).toEqual([]);
            expect(events).not.toHaveBeenCalled();
        });

        it('pracownik nie dostaje z roli skrzynki projektu bez hasła od PS (przed przejęciem), dostaje zarządzaną', async () => {
            mailboxes = [mailbox(1, 'proj'), mailbox(2, 'chocianow-ik', { projectId: null, contractId: 21, passwordVersion: null, agentCopyStatus: 'SET' })];
            rows = mailboxes.map((m) => row(m));
            await MailboxPasswordService.issue(person(5, 'ENVI_EMPLOYEE'));
            expect(secrets.map((s) => s.name)).toEqual(['poczta-proj']);
            expect(holders).toEqual([{ mailboxId: 1, personId: 5, version: 1 }]);
            expect((await SbAccessController.listPersonMailboxes(person(5, 'ENVI_EMPLOYEE'))).mailboxes.map((m) => m.code)).toEqual(['proj']);
        });
    });

    describe('zakładanie skrzynki', () => {
        it('z sekretem: hasło wersji 1, bez kopii dla agenta; bez sekretu jak przed SKO (losowe hasło, kopia)', async () => {
            mailboxes = [mailbox(1, 'nowa', { statusCode: 'PENDING', passwordVersion: null, agentCopyStatus: 'PENDING' })];
            jest.spyOn(MailboxRepository.prototype, 'setState').mockImplementation(async (id: number, statusCode: string) => {
                mailboxes.find((m) => m.id === id)!.statusCode = statusCode;
            });
            const create = jest.spyOn(DirectAdminGateway, 'create').mockResolvedValue(undefined);
            const copy = jest.spyOn(DirectAdminGateway, 'setAgentCopy').mockResolvedValue(undefined);
            const created = await MailboxController.provision(1);
            expect(create).toHaveBeenCalledWith('nowa@envi.com.pl', mailboxPassword('nowa', 1));
            expect(created).toMatchObject({ statusCode: 'ACTIVE', passwordVersion: 1, agentCopyStatus: 'NONE' });
            expect(mailboxes[0]).toMatchObject({ passwordVersion: 1, agentCopyStatus: 'NONE' });
            expect(copy).not.toHaveBeenCalled();
            await expect(MailboxController.agentCopy(1)).rejects.toMatchObject({ status: 409 });

            delete process.env.MAILBOX_PASSWORD_SECRET;
            mailboxes = [mailbox(2, 'stara', { statusCode: 'PENDING', passwordVersion: null, agentCopyStatus: 'PENDING' })];
            await MailboxController.provision(2);
            expect(create.mock.calls[1][1]).toMatch(/^[0-9a-f]{48}$/);
            expect(mailboxes[0]).toMatchObject({ statusCode: 'ACTIVE', passwordVersion: null, agentCopyStatus: 'SET' });
            expect(copy).toHaveBeenCalledWith('stara@envi.com.pl');
        });
    });

    describe('zmiana hasła (rotacja)', () => {
        it('sukces: nowa wersja na serwerze, szyfrogramy i posiadacze znikają, kopia dla agenta zdjęta, bez hasła w wyniku', async () => {
            mailboxes = [mailbox(1, 'proj', { agentCopyStatus: 'SET' })];
            secrets = [{ personId: 5, name: 'poczta-proj', ciphertext: 'x', sharedByPersonId: null }, { personId: 5, name: 'baza-ps', ciphertext: 'y', sharedByPersonId: 1 }];
            holders = [{ mailboxId: 1, personId: 5, version: 1 }];
            const result = await MailboxPasswordService.rotate(1);
            expect(server['proj@envi.com.pl']).toBe(mailboxPassword('proj', 2));
            expect(mailboxes[0]).toMatchObject({ passwordVersion: 2, agentCopyStatus: 'NONE', agentCopyLastError: null });
            expect(secrets.map((s) => s.name)).toEqual(['baza-ps']);
            expect(holders).toEqual([]);
            expect(DirectAdminGateway.removeAgentCopy).toHaveBeenCalledWith('proj@envi.com.pl');
            expect(inspect(result)).not.toContain(server['proj@envi.com.pl']);
        });

        it('przejęcie skrzynki (wersja NULL -> 1)', async () => {
            mailboxes = [mailbox(1, 'biuro', { projectId: null, passwordVersion: null })];
            await MailboxPasswordService.rotate(1);
            expect(server['biuro@envi.com.pl']).toBe(mailboxPassword('biuro', 1));
            expect(mailboxes[0].passwordVersion).toBe(1);
        });

        it('niepowodzenie serwera poczty: wersja, szyfrogramy i kopia bez zmian, błąd zwrócony', async () => {
            mailboxes = [mailbox(1, 'proj', { agentCopyStatus: 'SET' })];
            secrets = [{ personId: 5, name: 'poczta-proj', ciphertext: 'x', sharedByPersonId: null }];
            (DirectAdminGateway.changePassword as jest.Mock<any>).mockRejectedValue(new Error('Serwer poczty odrzucił operację. Skontaktuj się z administratorem'));
            await expect(MailboxPasswordService.rotate(1)).rejects.toThrow('Serwer poczty odrzucił');
            expect(mailboxes[0]).toMatchObject({ passwordVersion: 1, agentCopyStatus: 'SET' });
            expect(secrets).toHaveLength(1);
            expect(DirectAdminGateway.removeAgentCopy).not.toHaveBeenCalled();
        });

        it('ponowienie po błędzie zapisu ustawia na serwerze to samo hasło', async () => {
            mailboxes = [mailbox(1, 'proj')];
            const sent: string[] = [];
            (DirectAdminGateway.changePassword as jest.Mock<any>).mockImplementation(async (_a: any, password: any) => { sent.push(password); });
            (MailboxRepository.prototype.setPasswordVersion as jest.Mock<any>).mockRejectedValueOnce(new Error('ER_LOCK_WAIT_TIMEOUT'));
            await expect(MailboxPasswordService.rotate(1)).rejects.toThrow();
            expect(mailboxes[0].passwordVersion).toBe(1);
            await MailboxPasswordService.rotate(1);
            expect(sent).toEqual([mailboxPassword('proj', 2), mailboxPassword('proj', 2)]);
            expect(mailboxes[0].passwordVersion).toBe(2);
        });

        it('błąd zdjęcia kopii nie cofa zmiany hasła i zostaje przy skrzynce', async () => {
            mailboxes = [mailbox(1, 'proj', { agentCopyStatus: 'SET' })];
            (DirectAdminGateway.removeAgentCopy as jest.Mock<any>).mockRejectedValue(new Error('Nie można połączyć się z serwerem poczty. Spróbuj ponownie później'));
            const result = await MailboxPasswordService.rotate(1);
            expect(result).toMatchObject({ passwordVersion: 2, agentCopyStatus: 'SET', agentCopyLastError: expect.stringContaining('Nie można') });
        });
    });

    describe('uzgodnienie posiadaczy', () => {
        it('współpracownik zdjęty z projektu -> zmiana hasła; nadal uprawniony -> nic', async () => {
            mailboxes = [mailbox(1, 'proj'), mailbox(2, 'inny')];
            person(7, 'ENVI_COOPERATOR');
            person(5, 'ENVI_EMPLOYEE');
            rows = [row(mailboxes[0], 7), row(mailboxes[1])];
            holders = [{ mailboxId: 1, personId: 7, version: 1 }, { mailboxId: 1, personId: 5, version: 1 }, { mailboxId: 2, personId: 5, version: 1 }];
            expect(await MailboxPasswordService.reconcile()).toEqual({ rotated: [], failed: [] });
            expect(DirectAdminGateway.changePassword).not.toHaveBeenCalled();

            rows = [row(mailboxes[0]), row(mailboxes[1])];
            expect(await MailboxPasswordService.reconcile()).toEqual({ rotated: ['proj@envi.com.pl'], failed: [] });
            expect(mailboxes.map((m) => m.passwordVersion)).toEqual([2, 1]);
            expect(await MailboxPasswordService.reconcile()).toEqual({ rotated: [], failed: [] });
        });

        it.each([
            ['blokada w Dostępach SB', { statusCode: 'BLOCKED' }],
            ['konto PS nieaktywne', { isActive: false }],
            ['zmiana roli na klienta', { role: 'CLIENT' }],
        ])('%s -> zmiana hasła każdej skrzynki tej osoby', async (_name, change) => {
            mailboxes = [mailbox(1, 'proj')];
            rows = [row(mailboxes[0])];
            person(5, 'ENVI_EMPLOYEE', change as any);
            holders = [{ mailboxId: 1, personId: 5, version: 1 }];
            expect((await MailboxPasswordService.reconcile()).rotated).toEqual(['proj@envi.com.pl']);
        });

        it('wyjątek ręczny zdjęty z faktury@-podobnej skrzynki zarządzanej -> zmiana hasła', async () => {
            mailboxes = [mailbox(1, 'ogolna', { projectId: null })];
            rows = [row(mailboxes[0])];
            person(5, 'ENVI_EMPLOYEE', { mail: ['ogolna'] });
            holders = [{ mailboxId: 1, personId: 5, version: 1 }];
            expect((await MailboxPasswordService.reconcile()).rotated).toEqual([]);
            people[5].mail = [];
            expect((await MailboxPasswordService.reconcile()).rotated).toEqual(['ogolna@envi.com.pl']);
        });

        it('niepowodzenie serwera poczty w uzgodnieniu -> log i zgłoszenie z adresem skrzynki, bez hasła', async () => {
            mailboxes = [mailbox(1, 'proj')];
            rows = [row(mailboxes[0])];
            person(7, 'ENVI_COOPERATOR');
            holders = [{ mailboxId: 1, personId: 7, version: 1 }];
            (DirectAdminGateway.changePassword as jest.Mock<any>).mockRejectedValue(new Error('Serwer poczty odrzucił operację. Skontaktuj się z administratorem'));
            expect((await MailboxPasswordService.reconcile()).failed).toEqual([{ address: 'proj@envi.com.pl', error: expect.stringContaining('odrzucił') }]);
            expect(reports).toHaveBeenCalledTimes(1);
            const message = (reports.mock.calls[0][0] as Error).message;
            expect(message).toContain('proj@envi.com.pl');
            expect(message).toContain('odrzucił');
            expect(message).not.toContain(mailboxPassword('proj', 2));
            expect(console.error).toHaveBeenCalledWith(message);
        });
    });

    describe('zmień hasła wszystkich skrzynek zarządzanych', () => {
        it('częściowe niepowodzenie = lista do ponowienia, reszta zmieniona; faktury@ bez hasła od PS poza zakresem', async () => {
            mailboxes = [mailbox(1, 'a'), mailbox(2, 'b'), mailbox(3, 'c'), mailbox(4, 'faktury', { projectId: null, passwordVersion: null })];
            (DirectAdminGateway.changePassword as jest.Mock<any>).mockImplementation(async (address: any, password: any) => {
                if (address === 'b@envi.com.pl') throw new Error('Serwer poczty odrzucił operację. Skontaktuj się z administratorem');
                server[address] = password;
            });
            const result = await MailboxPasswordService.rotateAll();
            expect(result).toEqual({
                rotated: ['a@envi.com.pl', 'c@envi.com.pl'],
                failed: [{ address: 'b@envi.com.pl', error: 'Serwer poczty odrzucił operację. Skontaktuj się z administratorem' }],
                afterId: 3, remaining: 0,
            });
            expect(mailboxes.map((m) => m.passwordVersion)).toEqual([2, 1, 2, null]);
            expect(inspect(result)).not.toMatch(/[0-9a-f]{48}/);
            expect((reports.mock.calls[0][0] as Error).message).toContain('b@envi.com.pl');
        });

        it('partie: budżet czasu wyczerpany = remaining > 0, kolejne wywołanie od afterId', async () => {
            mailboxes = [mailbox(1, 'a'), mailbox(2, 'b'), mailbox(3, 'c')];
            expect(await MailboxPasswordService.rotateAll(0, 0)).toEqual({ rotated: [], failed: [], afterId: 0, remaining: 3 });
            expect(await MailboxPasswordService.rotateAll(1)).toEqual({ rotated: ['b@envi.com.pl', 'c@envi.com.pl'], failed: [], afterId: 3, remaining: 0 });
            expect(mailboxes.map((m) => m.passwordVersion)).toEqual([1, 2, 2]);
        });
    });

    describe('trasy', () => {
        async function call(route: string, parsedBody: any = {}, params: any = {}) {
            const response = { status: jest.fn().mockReturnThis(), send: jest.fn(), setHeader: jest.fn() };
            const next = jest.fn();
            await handlers[route]({ parsedBody, body: parsedBody, params, query: {}, session: { userData: { enviId: 1 } } }, response, next);
            return { response, next, body: response.send.mock.calls[0]?.[0] as any, error: next.mock.calls[0]?.[0] as any };
        }

        beforeEach(() => { jest.spyOn(SbAccessController, 'canManage').mockResolvedValue(true); });

        it('"Zmień hasło" w wyścigu z przejęciem: skrzynka przejęta przed blokadą wiersza -> zmiana przez PS, bez hasła jawnego', async () => {
            mailboxes = [mailbox(1, 'chc', { projectId: null, contractId: 21, passwordVersion: null })];
            const get = MailboxRepository.prototype.get as jest.Mock<any>;
            const read = get.getMockImplementation()!;
            get.mockImplementation(async (id: any, conn: any, lock: any) => {
                if (lock && mailboxes[0].passwordVersion == null) mailboxes[0].passwordVersion = 1; // przejęcie tuż przed blokadą
                return read(id, conn, lock);
            });
            const result = await call('post /mailboxes/:id/password', {}, { id: '1' });
            expect(result.next).not.toHaveBeenCalled();
            expect(result.body).not.toHaveProperty('password');
            expect(server['chc@envi.com.pl']).toBe(mailboxPassword('chc', 2));
            expect(mailboxes[0].passwordVersion).toBe(2);
        });

        it('ponowienie zdjęcia kopii: zarządzana z kopią -> zdjęcie; zarządzana bez kopii -> 409', async () => {
            mailboxes = [mailbox(1, 'proj', { agentCopyStatus: 'SET', agentCopyLastError: 'Nie można połączyć się z serwerem poczty' })];
            const copy = jest.spyOn(DirectAdminGateway, 'setAgentCopy');
            const retried = await call('post /mailboxes/:id/agentCopy', {}, { id: '1' });
            expect(DirectAdminGateway.removeAgentCopy).toHaveBeenCalledWith('proj@envi.com.pl');
            expect(retried.body).toMatchObject({ agentCopyStatus: 'NONE', agentCopyLastError: null });
            expect(mailboxes[0]).toMatchObject({ agentCopyStatus: 'NONE', agentCopyLastError: null, passwordVersion: 1 });
            expect((await call('post /mailboxes/:id/agentCopy', {}, { id: '1' })).error).toMatchObject({ status: 409 });
            expect(copy).not.toHaveBeenCalled();
            expect(DirectAdminGateway.changePassword).not.toHaveBeenCalled();
        });

        it('"Zmień hasło" skrzynki zarządzanej zmienia hasło bez hasła w odpowiedzi (K4)', async () => {
            mailboxes = [mailbox(1, 'proj')];
            const result = await call('post /mailboxes/:id/password', {}, { id: '1' });
            expect(result.next).not.toHaveBeenCalled();
            expect(result.response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
            expect(result.body).not.toHaveProperty('password');
            expect(result.body.passwordVersion).toBe(2);
            expect(inspect(result.body)).not.toContain(server['proj@envi.com.pl']);
        });

        it('dopisanie skrzynki ogólnofirmowej: tylko istniejącej na serwerze, nic nie zakłada', async () => {
            jest.spyOn(MailboxRepository.prototype, 'addressExists').mockResolvedValue(false);
            const add = jest.spyOn(MailboxRepository.prototype, 'addGeneral').mockImplementation(async (address, code, createdBy) =>
                mailbox(9, code, { address, projectId: null, passwordVersion: null, createdByPersonId: createdBy }));
            const create = jest.spyOn(DirectAdminGateway, 'create');
            jest.spyOn(DirectAdminGateway, 'accountExists').mockResolvedValueOnce(false).mockResolvedValueOnce(true);
            const missing = await call('post /mailboxes/general', { address: 'biuro@envi.com.pl' });
            expect(missing.error).toMatchObject({ status: 409, message: expect.stringContaining('nie ma skrzynki biuro@envi.com.pl') });
            expect(add).not.toHaveBeenCalled();
            const added = await call('post /mailboxes/general', { address: 'biuro@envi.com.pl' });
            expect(added.body).toMatchObject({ code: 'biuro', address: 'biuro@envi.com.pl', projectId: null, contractId: null, passwordVersion: null });
            expect(add).toHaveBeenCalledWith('biuro@envi.com.pl', 'biuro', 1);
            expect(create).not.toHaveBeenCalled();
            expect((await call('post /mailboxes/general', { address: 'Zly adres' })).error).toMatchObject({ status: 400 });
        });

        it('zakres "wszyscy pracownicy" tylko dla skrzynki ogólnofirmowej', async () => {
            mailboxes = [mailbox(1, 'proj'), mailbox(2, 'biuro', { projectId: null })];
            const set = jest.spyOn(MailboxRepository.prototype, 'setAllEmployees').mockResolvedValue(undefined);
            expect((await call('put /mailboxes/:id/allEmployees', { allEmployees: true }, { id: '1' })).error).toMatchObject({ status: 409 });
            expect((await call('put /mailboxes/:id/allEmployees', { allEmployees: 'tak' }, { id: '2' })).error).toMatchObject({ status: 400 });
            expect((await call('put /mailboxes/:id/allEmployees', { allEmployees: true }, { id: '2' })).body).toMatchObject({ code: 'biuro', allEmployees: true });
            expect(set).toHaveBeenCalledWith(2, true);
        });

        it('trasy ogólnofirmowe i "zmień wszystkie" tylko dla zarządzającego Dostępami SB', async () => {
            (SbAccessController.canManage as jest.Mock<any>).mockResolvedValue(false);
            for (const [route, params] of [['post /mailboxes/general', {}], ['put /mailboxes/:id/allEmployees', { id: '2' }], ['post /mailboxes/passwords/rotateAll', {}]] as const)
                expect((await call(route, { address: 'biuro@envi.com.pl', allEmployees: true }, params)).error).toMatchObject({ status: 403 });
            expect(DirectAdminGateway.changePassword).not.toHaveBeenCalled();
        });

        it('przejęcie hasła: tylko skrzynka bez hasła od PS, tylko zarządzający, bez hasła w odpowiedzi', async () => {
            mailboxes = [mailbox(1, 'proj'), mailbox(3, 'biuro', { projectId: null, passwordVersion: null, allEmployees: true }),
                mailbox(4, 'faktury', { projectId: null, passwordVersion: null })];
            const taken = await call('post /mailboxes/:id/takeOver', {}, { id: '3' });
            expect(taken.body).toMatchObject({ code: 'biuro', passwordVersion: 1 });
            expect(inspect(taken.body)).not.toContain(server['biuro@envi.com.pl']);
            expect((await call('post /mailboxes/:id/takeOver', {}, { id: '1' })).error).toMatchObject({ status: 409 });
            // faktury@ (wskazane osoby, K3) zostaje z hasłem ręcznym
            expect((await call('post /mailboxes/:id/takeOver', {}, { id: '4' })).error)
                .toMatchObject({ status: 409, message: expect.stringContaining('zostaje z hasłem ręcznym') });
            expect(server['faktury@envi.com.pl']).toBeUndefined();
            expect(mailboxes[2].passwordVersion).toBeNull();
            (SbAccessController.canManage as jest.Mock<any>).mockResolvedValue(false);
            expect((await call('post /mailboxes/:id/takeOver', {}, { id: '3' })).error).toMatchObject({ status: 403 });
        });

        it('"zmień wszystkie" przez trasę: partia z listą niepowodzeń, bez haseł', async () => {
            mailboxes = [mailbox(1, 'a'), mailbox(2, 'b')];
            const result = await call('post /mailboxes/passwords/rotateAll', { afterId: 1 });
            expect(result.body).toEqual({ rotated: ['b@envi.com.pl'], failed: [], afterId: 2, remaining: 0 });
            expect((await call('post /mailboxes/passwords/rotateAll', { afterId: -1 })).error).toMatchObject({ status: 400 });
        });
    });
});
