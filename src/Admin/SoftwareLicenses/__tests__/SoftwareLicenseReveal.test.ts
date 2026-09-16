jest.mock('../../../index', () => ({ app: require('express')() }));
jest.mock('../../../setup/Sessions/ToolsGapi', () => ({ oAuthClient: {} }));
jest.mock('../../../tools/ToolsDb', () => ({ __esModule: true, default: { pool: { query: jest.fn() }, transaction: jest.fn() } }));
import express from 'express';
import { Server } from 'http';
import { inspect } from 'util';
import ToolsDb from '../../../tools/ToolsDb';
import { app } from '../../../index';
import { sanitizeSoftwareLicenseError } from '../SoftwareLicenseHttp';

const query = ToolsDb.pool.query as jest.Mock;
const transaction = ToolsDb.transaction as jest.Mock;
let server: Server;
let origin: string;
let encrypt: (key: string) => string;
const secret = 'SYNTHETIC-PRIVATE';
beforeAll(async () => {
    process.env.SOFTWARE_LICENSE_ENCRYPTION_KEY = 'ab'.repeat(32);
    encrypt = require('../licenseKeyCipher').encryptLicenseKey;
    app.use(express.json());
    app.use((req: any, _res, next) => {
        if (req.headers['x-test-role']) req.session = { userData: {
            systemRoleName: req.headers['x-test-role'], enviId: Number(req.headers['x-test-actor']),
        } };
        next();
    });
    require('../../AdminPanelRouters');
    require('../SoftwareLicensesRouters');
    app.use((error: any, req: any, res: any, _next: any) => {
        const safe: any = sanitizeSoftwareLicenseError(error, req);
        res.status(safe.status || 500).json({ errorMessage: safe.message, diagnostic: inspect({ safe, body: req.body }) });
    });
    await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    origin = `http://127.0.0.1:${(server.address() as any).port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
    query.mockReset();
    transaction.mockReset().mockImplementation(async callback => callback({ query }));
});
async function request(role: string | null = 'ADMIN', actor = '17', id = '1', body: any = {}) {
    const res = await fetch(`${origin}/admin/softwareLicense/${id}/reveal-key`, {
        method: 'POST', headers: { 'Content-Type': 'application/json',
            ...(role ? { 'x-test-role': role, 'x-test-actor': actor } : {}) }, body: JSON.stringify(body),
    });
    return { status: res.status, headers: res.headers, body: await res.json() as any };
}
describe('audited key reveal', () => {
    it.each([null, 'ENVI_MANAGER', 'ENVI_EMPLOYEE', 'admin', 'ADMIN,ENVI_MANAGER'])('rejects role %p before DB access', async role => {
        expect((await request(role)).status).toBe(role ? 403 : 401);
        expect(query).not.toHaveBeenCalled();
        expect(transaction).not.toHaveBeenCalled();
    });
    it.each(['', '0', '-1', '1.1', 'NaN', '2147483648'])('rejects unidentifiable administrator %p', async actor => {
        expect((await request('ADMIN', actor)).status).toBe(403);
        expect(query).not.toHaveBeenCalled();
    });
    it.each(['123', 'null', 'true', '"quoted"', '  spaces  ', 'Zażółć😀'])('returns exact key after audit for %p', async key => {
        const encrypted = encrypt(key);
        query.mockResolvedValueOnce([[{ EncryptedLicenseKey: encrypted }]]).mockResolvedValueOnce([{ insertId: 1 }]);
        const result = await request('ADMIN', '17', '1', { actorPersonId: 999, enviId: 999, licenseKey: secret });
        expect(result.status).toBe(200);
        expect(result.body).toEqual({ licenseKey: key });
        expect(result.headers.get('cache-control')).toBe('no-store');
        expect(result.headers.get('etag')).toBeNull();
        expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
        expect(query.mock.calls[1][1]).toEqual([1, 17]);
        expect(query.mock.calls[1][0]).toContain('UTC_TIMESTAMP(6)');
        expect(inspect(query.mock.calls[1])).not.toContain(encrypted);
    });
    it.each([undefined, null, 'corrupt'])('does not audit or disclose missing/unreadable key %p', async key => {
        query.mockResolvedValueOnce([key === undefined ? [] : [{ EncryptedLicenseKey: key }]]);
        const result = await request();
        expect(result.status).toBe(key === 'corrupt' ? 500 : 400);
        expect(result.body.licenseKey).toBeUndefined();
        expect(query).toHaveBeenCalledTimes(1);
    });
    it('fails closed on audit write failure and scrubs driver/request data', async () => {
        const encrypted = encrypt(secret);
        query.mockResolvedValueOnce([[{ EncryptedLicenseKey: encrypted }]])
            .mockRejectedValueOnce(Object.assign(new Error(secret), { sql: encrypted }));
        const result = await request('ADMIN', '17', '1', { nested: { licenseKey: secret } });
        expect(result.status).toBe(500);
        expect(JSON.stringify(result.body)).not.toMatch(/SYNTHETIC|v1:/);
        expect(result.body.licenseKey).toBeUndefined();
        expect(query).toHaveBeenCalledTimes(2);
    });
    it('waits for transaction completion and denies the key when commit fails', async () => {
        query.mockResolvedValueOnce([[{ EncryptedLicenseKey: encrypt(secret) }]]).mockResolvedValueOnce([{ insertId: 1 }]);
        transaction.mockImplementationOnce(async callback => { await callback({ query }); throw new Error(secret); });
        const result = await request();
        expect(result.status).toBe(500);
        expect(JSON.stringify(result.body)).not.toContain(secret);
        expect(result.body.licenseKey).toBeUndefined();
    });
    it('rejects malformed license id without database access', async () => {
        expect((await request('ADMIN', '17', '1e2')).status).toBe(400);
        expect(query).not.toHaveBeenCalled();
    });
});
