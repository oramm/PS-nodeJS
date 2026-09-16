jest.mock('../../../index', () => ({ app: require('express')() }));
jest.mock('../../../setup/Sessions/ToolsGapi', () => ({ oAuthClient: {} }));
jest.mock('../../../tools/ToolsDb', () => ({ __esModule: true, default: { pool: { query: jest.fn() }, transaction: jest.fn() } }));
import express from 'express';
import { Server } from 'http';
import { inspect } from 'util';
import ToolsDb from '../../../tools/ToolsDb';
import { app } from '../../../index';
import { sanitizeSoftwareLicenseError } from '../SoftwareLicenseHttp';
import SoftwareLicenseRepository from '../SoftwareLicenseRepository';
import Validator from '../SoftwareLicenseValidator';
import SoftwareLicense from '../SoftwareLicense';

const query = ToolsDb.pool.query as jest.Mock;
const transaction = ToolsDb.transaction as jest.Mock;
const valid = { manufacturer: 'Test', product: 'Test', seatsPurchased: 3, seatsUsed: 1 };
const row = { Id: 1, Manufacturer: 'Test', Product: 'Test', SeatsPurchased: 3, SeatsUsed: 1, Cost: null, HasLicenseKey: 1,
    EncryptedLicenseKey: 'SYNTHETIC-CIPHERTEXT', LicenseKey: 'SYNTHETIC-PRIVATE' };
let server: Server;
let origin: string;

beforeAll(async () => {
    process.env.SOFTWARE_LICENSE_ENCRYPTION_KEY = 'ab'.repeat(32);
    app.use(express.json());
    app.use((req: any, _res, next) => {
        req.parsedBody = { ...req.body, licenseKey: 123 }; // deliberately lossy legacy parser
        if (req.headers['x-test-role']) req.session = { userData: { systemRoleName: req.headers['x-test-role'] } };
        next();
    });
    require('../../AdminPanelRouters');
    require('../SoftwareLicensesRouters');
    app.use((error: any, req: any, res: any, _next: any) => {
        const safe: any = sanitizeSoftwareLicenseError(error, req);
        res.status(safe.status || 500).send({ errorMessage: safe.message, diagnostic: inspect({ safe, body: req.body, parsedBody: req.parsedBody }) });
    });
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
    origin = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
beforeEach(() => {
    query.mockReset();
    transaction.mockImplementation(async (callback) => callback({ query }));
});

async function request(path: string, method = 'POST', body: any = {}, role: string | null = 'ADMIN') {
    const response = await fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', ...(role ? { 'x-test-role': role } : {}) }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
}

describe('license HTTP and persistence boundaries', () => {
    it.each([null, 'ENVI_USER'])('denies all routes to %p before DB', async (role) => {
        for (const [path, method] of [['/admin/softwareLicenses', 'POST'], ['/admin/softwareLicense', 'POST'], ['/admin/softwareLicense/1', 'PUT'], ['/admin/softwareLicense/1', 'DELETE']]) {
            expect((await request(path, method, valid, role)).status).toBe(role ? 403 : 401);
        }
        expect(query).not.toHaveBeenCalled();
    });
    it.each(['ADMIN', 'ENVI_MANAGER'])('lists without either key for %s', async (role) => {
        query.mockResolvedValue([[row]]);
        const response = await request('/admin/softwareLicenses', 'POST', {}, role);
        expect(response.status).toBe(200);
        expect(response.body[0]).toMatchObject({ id: 1, hasLicenseKey: true, seatsFree: 2 });
        expect(JSON.stringify(response)).not.toMatch(/SYNTHETIC|"(?:encryptedLicenseKey|licenseKey)"\s*:/i);
        const sql = query.mock.calls[0][0];
        expect(sql).not.toMatch(/SELECT\s+\*/i);
        expect(sql.match(/EncryptedLicenseKey/g)).toHaveLength(1);
        expect(sql).toContain('(EncryptedLicenseKey IS NOT NULL) AS HasLicenseKey');
    });
    it.each(['ADMIN', 'ENVI_MANAGER'])('creates encrypted key with safe response for %s', async (role) => {
        query.mockResolvedValueOnce([{ insertId: 1 }]).mockResolvedValueOnce([[row]]);
        const response = await request('/admin/softwareLicense', 'POST', { ...valid, licenseKey: '123', encryptedLicenseKey: 'INJECTED', editorId: 99 }, role);
        expect(response.status).toBe(200);
        const encrypted = query.mock.calls[0][1].at(-1);
        expect(require('../licenseKeyCipher').decryptLicenseKey(encrypted)).toBe('123');
        expect(JSON.stringify(response)).not.toContain(encrypted);
        expect(query.mock.calls[0][0]).not.toMatch(/EditorId|HasLicenseKey|SeatsFree/);
        expect(query.mock.calls[0][1]).not.toContain('INJECTED');
    });
    it('edits under lock, clears nulls, preserves omitted key and uses URL id', async () => {
        query.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[row]]);
        expect((await request('/admin/softwareLicense/1', 'PUT', { id: 9, cost: '', version: null })).status).toBe(200);
        expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
        expect(query.mock.calls[1][0]).not.toContain('EncryptedLicenseKey');
        expect(query.mock.calls[1][1].at(-1)).toBe(1);
        expect(query.mock.calls[1][1]).toContain(null);
    });
    it('rejects invalid input before writes and returns 400 without the key', async () => {
        const response = await request('/admin/softwareLicense', 'POST', { ...valid, seatsUsed: 1.1, licenseKey: 'SYNTHETIC-PRIVATE' });
        expect(response.status).toBe(400);
        expect(JSON.stringify(response)).not.toContain('SYNTHETIC');
        expect(query).not.toHaveBeenCalled();
    });
    it('rejects an array update body before DB access', async () => {
        expect((await request('/admin/softwareLicense/1', 'PUT', [])).status).toBe(400);
        expect(query).not.toHaveBeenCalled();
    });
    it('returns 400 for missing update/delete records', async () => {
        query.mockResolvedValue([[]]);
        for (const method of ['PUT', 'DELETE']) expect((await request('/admin/softwareLicense/1', method, valid)).status).toBe(400);
        expect(query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(true);
    });
    it('sanitizes driver SQL, body and nested key data before global reporting', async () => {
        const error = Object.assign(new Error('SYNTHETIC-PRIVATE'), { sql: 'SYNTHETIC-CIPHERTEXT', sqlMessage: 'SYNTHETIC-PRIVATE' });
        query.mockRejectedValue(error);
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});
        const response = await request('/ADMIN/softwareLicense', 'POST', { ...valid, licenseKey: 'SYNTHETIC-PRIVATE', nested: { key: 'SYNTHETIC-PRIVATE' } });
        expect(response.status).toBe(500);
        expect(JSON.stringify(response)).not.toContain('SYNTHETIC');
        expect(inspect(log.mock.calls)).not.toContain('SYNTHETIC');
        expect(query).toHaveBeenCalledTimes(1);
    });
    it('sanitizes invalid JSON errors before route execution', async () => {
        const response = await fetch(origin + '/admin/softwareLicense', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"licenseKey":"SYNTHETIC-PRIVATE",bad}' });
        expect(response.status).toBe(400);
        expect(await response.text()).not.toContain('SYNTHETIC');
    });
    it('binds search values instead of SQL interpolation', async () => {
        query.mockResolvedValue([[]]);
        await new SoftwareLicenseRepository().find([{ searchText: "x' OR 1=1 --" }]);
        expect(query.mock.calls[0][0]).not.toContain("x'");
        expect(query.mock.calls[0][1]).toContain("%x'%");
    });
    it('write errors expose neither plaintext nor ciphertext and are not retried', async () => {
        query.mockRejectedValue(Object.assign(new Error('SYNTHETIC-CIPHERTEXT'), { sql: 'SYNTHETIC-CIPHERTEXT' }));
        const repo = new SoftwareLicenseRepository();
        const item = new SoftwareLicense(Validator.validatePayload(valid), 1);
        await expect(repo.editInDb(item, undefined, false, undefined, 'SYNTHETIC-CIPHERTEXT')).rejects.toThrow('Nie można wykonać operacji na licencjach.');
        expect(query).toHaveBeenCalledTimes(1);
    });
});
