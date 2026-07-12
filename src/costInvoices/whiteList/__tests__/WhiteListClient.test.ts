import WhiteListClient, { toWhiteListStatus } from '../WhiteListClient';

// Prawdziwy (fikcyjny, ale checksumowo poprawny) NIP uzywany w testach jednostkowych.
const VALID_NIP = '5260001016';
const VALID_NRB = '12345678901234567890123456'; // 26 cyfr

function makeFetchResponse(options: { status?: number; body?: any }): Response {
    const { status = 200, body = {} } = options;
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        json: jest.fn().mockResolvedValue(body),
    } as unknown as Response;
}

describe('WhiteListClient.check — mapowanie odpowiedzi KAS', () => {
    let client: WhiteListClient;
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
        client = new WhiteListClient();
        fetchSpy = jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    it('accountAssigned "TAK" -> VERIFIED_OK z requestId', async () => {
        fetchSpy.mockResolvedValue(
            makeFetchResponse({
                body: { result: { accountAssigned: 'TAK', requestId: 'req-123' } },
            }),
        );

        const result = await client.check(VALID_NIP, VALID_NRB);

        expect(result.status).toBe('VERIFIED_OK');
        expect(result.requestId).toBe('req-123');
        expect(result.checkedAt).toBeInstanceOf(Date);
    });

    it('accountAssigned "NIE" -> VERIFIED_MISMATCH', async () => {
        fetchSpy.mockResolvedValue(
            makeFetchResponse({
                body: { result: { accountAssigned: 'NIE', requestId: 'req-456' } },
            }),
        );

        const result = await client.check(VALID_NIP, VALID_NRB);

        expect(result.status).toBe('VERIFIED_MISMATCH');
        expect(result.requestId).toBe('req-456');
    });

    it('HTTP != ok (np. 500) -> ERROR (fail-open)', async () => {
        fetchSpy.mockResolvedValue(makeFetchResponse({ status: 500, body: {} }));

        const result = await client.check(VALID_NIP, VALID_NRB);

        expect(result.status).toBe('ERROR');
    });

    it('fetch rzuca wyjątek (błąd sieciowy/timeout) -> ERROR (fail-open), nie propaguje wyjątku', async () => {
        fetchSpy.mockRejectedValue(new Error('network timeout'));

        const result = await client.check(VALID_NIP, VALID_NRB);

        expect(result.status).toBe('ERROR');
    });

    it('nieoczekiwany ksztalt odpowiedzi (brak accountAssigned) -> ERROR', async () => {
        fetchSpy.mockResolvedValue(
            makeFetchResponse({ body: { result: {} } }),
        );

        const result = await client.check(VALID_NIP, VALID_NRB);

        expect(result.status).toBe('ERROR');
    });

    it('buduje URL z NIP, NRB (same cyfry) i domyślną datą dzisiejszą', async () => {
        fetchSpy.mockResolvedValue(
            makeFetchResponse({ body: { result: { accountAssigned: 'TAK', requestId: 'x' } } }),
        );

        await client.check(VALID_NIP, '12 3456 7890 1234 5678 9012 3456'); // NRB z formatowaniem (spacje), digits === VALID_NRB

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const calledUrl = fetchSpy.mock.calls[0][0] as string;
        expect(calledUrl).toContain(`/api/check/nip/${VALID_NIP}/bank-account/${VALID_NRB}`);
        expect(calledUrl).toMatch(/\?date=\d{4}-\d{2}-\d{2}$/);
    });

    it('przyjmuje jawną datę i formatuje ją jako YYYY-MM-DD', async () => {
        fetchSpy.mockResolvedValue(
            makeFetchResponse({ body: { result: { accountAssigned: 'TAK', requestId: 'x' } } }),
        );

        await client.check(VALID_NIP, VALID_NRB, new Date('2024-03-05T10:00:00Z'));

        const calledUrl = fetchSpy.mock.calls[0][0] as string;
        expect(calledUrl).toContain('?date=2024-03-05');
    });
});

describe('WhiteListClient.check — walidacja wejścia (NOT_APPLICABLE bez wywołania API)', () => {
    let client: WhiteListClient;
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
        client = new WhiteListClient();
        fetchSpy = jest.spyOn(global, 'fetch');
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    it('brak NIP -> NOT_APPLICABLE, brak wywołania HTTP', async () => {
        const result = await client.check(undefined, VALID_NRB);
        expect(result.status).toBe('NOT_APPLICABLE');
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('brak NRB (brak SupplierBankAccount) -> NOT_APPLICABLE, brak wywołania HTTP', async () => {
        const result = await client.check(VALID_NIP, undefined);
        expect(result.status).toBe('NOT_APPLICABLE');
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('NIP z niepoprawną sumą kontrolną -> NOT_APPLICABLE, brak wywołania HTTP', async () => {
        const result = await client.check('1234567890', VALID_NRB); // suma kontrolna niepoprawna
        expect(result.status).toBe('NOT_APPLICABLE');
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('NRB o niepoprawnej długości -> NOT_APPLICABLE, brak wywołania HTTP', async () => {
        const result = await client.check(VALID_NIP, '12345');
        expect(result.status).toBe('NOT_APPLICABLE');
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('pusty string NIP -> NOT_APPLICABLE', async () => {
        const result = await client.check('', VALID_NRB);
        expect(result.status).toBe('NOT_APPLICABLE');
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe('toWhiteListStatus', () => {
    it('zwraca wartość dla poprawnych statusów', () => {
        expect(toWhiteListStatus('VERIFIED_OK')).toBe('VERIFIED_OK');
        expect(toWhiteListStatus('VERIFIED_MISMATCH')).toBe('VERIFIED_MISMATCH');
        expect(toWhiteListStatus('ERROR')).toBe('ERROR');
        expect(toWhiteListStatus('NOT_APPLICABLE')).toBe('NOT_APPLICABLE');
        expect(toWhiteListStatus('NOT_CHECKED')).toBe('NOT_CHECKED');
    });

    it('domyślnie NOT_CHECKED dla nieznanej/pustej wartości', () => {
        expect(toWhiteListStatus('GARBAGE')).toBe('NOT_CHECKED');
        expect(toWhiteListStatus(undefined)).toBe('NOT_CHECKED');
        expect(toWhiteListStatus(null)).toBe('NOT_CHECKED');
    });
});
