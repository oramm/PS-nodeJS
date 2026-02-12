jest.mock('../../../setup/Setup', () => ({
    __esModule: true,
    default: {
        KSeF: {
            environment: 'test',
            nip: '1234567890',
            token: 'test-token',
            apiBaseUrl: undefined,
            sellerName: 'Test Sp. z o.o.',
            sellerStreet: 'Testowa 1',
            sellerCity: 'Warszawa',
            sellerPostalCode: '00-001',
            sellerCountry: 'PL',
        },
    },
}));

import KsefService from '../KsefService';

function makeFetchResponse(options: {
    status?: number;
    contentType?: string;
    body?: string;
    url?: string;
}): Response {
    const { status = 200, contentType, body = '', url = 'https://ksef-test.mf.gov.pl/api/test' } = options;
    const headers = new Headers();
    if (contentType) headers.set('content-type', contentType);
    if (body) headers.set('content-length', String(body.length));

    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        headers,
        url,
        text: jest.fn().mockResolvedValue(body),
    } as unknown as Response;
}

describe('KsefService.requestJson – response handling', () => {
    let service: KsefService;
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
        service = new KsefService();
        fetchSpy = jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    it('parsuje poprawny JSON', async () => {
        const payload = { referenceNumber: 'ABC-123' };
        fetchSpy.mockResolvedValue(
            makeFetchResponse({
                contentType: 'application/json',
                body: JSON.stringify(payload),
            }),
        );

        const result = await (service as any).requestJson('GET', '/test');
        expect(result).toEqual(payload);
    });

    it('zwraca {} dla odpowiedzi 204 No Content', async () => {
        fetchSpy.mockResolvedValue(
            makeFetchResponse({
                status: 204,
                body: '',
            }),
        );

        const result = await (service as any).requestJson('GET', '/test');
        expect(result).toEqual({});
    });

    it('zwraca {} dla pustego body z content-length: 0', async () => {
        const response = makeFetchResponse({ body: '' });
        response.headers.set('content-length', '0');
        fetchSpy.mockResolvedValue(response);

        const result = await (service as any).requestJson('GET', '/test');
        expect(result).toEqual({});
    });

    it('rzuca błąd dla HTML response (content-type text/html)', async () => {
        fetchSpy.mockResolvedValue(
            makeFetchResponse({
                contentType: 'text/html',
                body: '<!doctype html><html><body>Redirect</body></html>',
            }),
        );

        await expect(
            (service as any).requestJson('GET', '/test'),
        ).rejects.toThrow('KSeF zwrócił nie-JSON');
    });

    it('rzuca błąd gdy body zaczyna się od < mimo content-type application/json', async () => {
        fetchSpy.mockResolvedValue(
            makeFetchResponse({
                contentType: 'application/json',
                body: '<html><body>Error page</body></html>',
            }),
        );

        await expect(
            (service as any).requestJson('GET', '/test'),
        ).rejects.toThrow('KSeF zwrócił nie-JSON');
    });

    it('rzuca błąd dla nieprawidłowego JSON (content-type ok, body broken)', async () => {
        fetchSpy.mockResolvedValue(
            makeFetchResponse({
                contentType: 'application/json',
                body: '{"broken: json',
            }),
        );

        await expect(
            (service as any).requestJson('GET', '/test'),
        ).rejects.toThrow('KSeF zwrócił nieprawidłowy JSON');
    });

    it('rzuca błąd dla HTTP 4xx/5xx', async () => {
        fetchSpy.mockResolvedValue(
            makeFetchResponse({
                status: 403,
                contentType: 'application/json',
                body: '{"message":"Forbidden"}',
            }),
        );

        await expect(
            (service as any).requestJson('GET', '/test'),
        ).rejects.toThrow('KSeF HTTP 403');
    });

    it('komunikat błędu zawiera requestUrl i responseUrl', async () => {
        fetchSpy.mockResolvedValue(
            makeFetchResponse({
                contentType: 'text/html',
                body: '<!doctype html><html></html>',
                url: 'https://redirected.example.com/login',
            }),
        );

        await expect(
            (service as any).requestJson('GET', '/test'),
        ).rejects.toThrow(/requestUrl=.*responseUrl=/);
    });
});

describe('KsefService.getApiUrl', () => {
    it('zwraca URL testowy domyślnie', () => {
        const url = KsefService.getApiUrl();
        expect(url).toBe('https://api-test.ksef.mf.gov.pl/v2');
    });
});
