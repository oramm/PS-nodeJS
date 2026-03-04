jest.mock('../../../setup/Setup', () => ({
    __esModule: true,
    default: {
        KSeF: {
            environment: 'test',
            nip: '1234567890',
            token: 'test-token',
            apiBaseUrl: undefined,
            seller: {
                name: 'Test Sp. z o.o.',
                street: 'Testowa 1',
                city: 'Warszawa',
                postalCode: '00-001',
                bankAccount: 'PL61109010140000071219812874',
                bankName: 'Test Bank',
            },
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

describe('KsefService.parseInvoiceXmlToListItem', () => {
    it('parsuje saleDate (P_6) i dueDate (Platnosc/TerminPlatnosci/Termin)', () => {
        const service = new KsefService();
        const xml = `
            <Faktura>
                <Podmiot1>
                    <DaneIdentyfikacyjne>
                        <NIP>1234567890</NIP>
                        <Nazwa>Dostawca Test</Nazwa>
                    </DaneIdentyfikacyjne>
                </Podmiot1>
                <Fa>
                    <P_1>2026-03-01</P_1>
                    <P_6>2026-02-28</P_6>
                    <P_2>FV/3/2026</P_2>
                    <P_15>123.45</P_15>
                    <KodWaluty>PLN</KodWaluty>
                    <Platnosc>
                        <TerminPlatnosci>
                            <Termin>2026-03-15</Termin>
                        </TerminPlatnosci>
                        <RachunekBankowy>
                            <NrRB>PL61109010140000071219812874</NrRB>
                        </RachunekBankowy>
                    </Platnosc>
                </Fa>
            </Faktura>
        `;

        const item = (service as any).parseInvoiceXmlToListItem(xml, 'test.xml');

        expect(item).toBeTruthy();
        expect(item.saleDate).toBe('2026-02-28');
        expect(item.dueDate).toBe('2026-03-15');
        expect(item.bankAccount).toBe('PL61109010140000071219812874');
        expect(item.invoicingDate).toBe('2026-03-01');
    });

    it('fallback saleDate do P_1 gdy brak P_6', () => {
        const service = new KsefService();
        const xml = `
            <Faktura>
                <Fa>
                    <P_1>2026-03-02</P_1>
                    <P_2>FV/4/2026</P_2>
                </Fa>
            </Faktura>
        `;

        const item = (service as any).parseInvoiceXmlToListItem(xml, 'test2.xml');

        expect(item).toBeTruthy();
        expect(item.saleDate).toBe('2026-03-02');
        expect(item.dueDate).toBe('');
        expect(item.bankAccount).toBe('');
    });
});
