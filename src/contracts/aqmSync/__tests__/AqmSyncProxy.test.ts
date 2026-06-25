/**
 * WS10 / N5 — DB-free tests for the PS /aqm/match proxy (Task A).
 *
 * Coverage:
 *  - passthrough of AQM match result for all 3 states (NIP / NAME / NONE)
 *  - the AQM Bearer token is sent server-side to AQM but NEVER returned to the
 *    caller (front must never see it)
 *  - misconfiguration / network error degrades to a soft 502 (non-blocking)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../tools/ToolsDb');

import { fetchAqmMatch } from '../AqmSync';

describe('fetchAqmMatch (PS /aqm/match proxy core)', () => {
    const ORIG_BASE = process.env.AQM_SYNC_BASE_URL;
    const ORIG_TOKEN = process.env.AQM_SYNC_TOKEN;

    beforeEach(() => {
        process.env.AQM_SYNC_BASE_URL = 'https://aqm.example';
        process.env.AQM_SYNC_TOKEN = 'super-secret-token';
    });

    afterAll(() => {
        if (ORIG_BASE === undefined) delete process.env.AQM_SYNC_BASE_URL;
        else process.env.AQM_SYNC_BASE_URL = ORIG_BASE;
        if (ORIG_TOKEN === undefined) delete process.env.AQM_SYNC_TOKEN;
        else process.env.AQM_SYNC_TOKEN = ORIG_TOKEN;
    });

    const mkAqm = (body: any, status = 200) => {
        const fetchMock = jest
            .fn<any>()
            .mockResolvedValue({ status, json: async () => body });
        (global as any).fetch = fetchMock;
        return fetchMock;
    };

    it('passes through match=NIP with organization', async () => {
        const aqmBody = {
            match: 'NIP',
            organization: {
                id: 7,
                name: 'PWiK Sp. z o.o.',
                taxNr: '7471917575',
                hasLegacyEntityId: true,
            },
        };
        mkAqm(aqmBody);
        const result = await fetchAqmMatch({ taxNr: '747-191-75-75' });
        expect(result.status).toBe(200);
        expect(result.body).toEqual(aqmBody);
    });

    it('passes through match=NAME', async () => {
        mkAqm({ match: 'NAME', organization: { id: 9, name: 'X', taxNr: null, hasLegacyEntityId: false } });
        const result = await fetchAqmMatch({ taxNr: '0000000000', name: 'X' });
        expect(result.status).toBe(200);
        expect(result.body.match).toBe('NAME');
    });

    it('passes through match=NONE with null organization', async () => {
        mkAqm({ match: 'NONE', organization: null });
        const result = await fetchAqmMatch({ taxNr: '1234563218' });
        expect(result.status).toBe(200);
        expect(result.body).toEqual({ match: 'NONE', organization: null });
    });

    it('sends the Bearer token to AQM but never returns it to the caller', async () => {
        const fetchMock = mkAqm({ match: 'NONE', organization: null });
        const result = await fetchAqmMatch({ taxNr: '1234563218' });

        // Token IS attached to the outbound AQM call (server-side).
        const [, init] = fetchMock.mock.calls[0] as any;
        expect(init.headers.Authorization).toBe('Bearer super-secret-token');

        // Token is NOT present anywhere in what we hand back to the front.
        const serialized = JSON.stringify(result);
        expect(serialized).not.toContain('super-secret-token');
        expect(serialized).not.toContain('Authorization');
    });

    it('forwards taxNr (and optional name) as query params to AQM', async () => {
        const fetchMock = mkAqm({ match: 'NONE', organization: null });
        await fetchAqmMatch({ taxNr: '7471917575', name: 'PWiK' });
        const [url] = fetchMock.mock.calls[0] as any;
        expect(url).toContain('/api/integrations/ps-envi/match');
        expect(url).toContain('taxNr=7471917575');
        expect(url).toContain('name=PWiK');
    });

    it('degrades to a soft 502 when AQM is unreachable (non-blocking)', async () => {
        (global as any).fetch = jest
            .fn<any>()
            .mockRejectedValue(new Error('ECONNREFUSED'));
        const result = await fetchAqmMatch({ taxNr: '7471917575' });
        expect(result.status).toBe(502);
        expect(result.body.match).toBe('NONE');
        expect(result.body.organization).toBeNull();
    });

    it('returns 502 when AQM_SYNC_BASE_URL is not configured', async () => {
        delete process.env.AQM_SYNC_BASE_URL;
        const result = await fetchAqmMatch({ taxNr: '7471917575' });
        expect(result.status).toBe(502);
        expect(result.body.match).toBe('NONE');
    });
});
