/**
 * NIP-G1 — POST /entities/lookup-nip router test. Same mocking idiom as
 * CostInvoicesRouter.whiteList.test.ts: mock `app`, require the router file,
 * pull the registered handler out of the mock's call args, invoke directly
 * with fake req/res/next.
 */
/// <reference types="jest" />
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { app } from '../../index';

jest.mock('../../index', () => ({
    app: {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
    },
}));

const mockLookupByNip = jest.fn<(...args: any[]) => any>();
const mockIsConfigured = jest.fn<(...args: any[]) => any>();
jest.mock('../gusBir/GusBirService', () => {
    const actual = jest.requireActual('../gusBir/GusBirService') as any;
    return {
        __esModule: true,
        default: {
            isConfigured: mockIsConfigured,
            lookupByNip: mockLookupByNip,
        },
        GusBirNotConfiguredError: actual.GusBirNotConfiguredError,
        GusBirNotFoundError: actual.GusBirNotFoundError,
    };
});

function makeRes() {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

describe('EntitiesRouters — POST /entities/lookup-nip', () => {
    let handler: any;

    beforeAll(() => {
        require('../EntitiesRouters');
        const postMock = app.post as jest.Mock;
        const call = postMock.mock.calls.find((c: any) => c[0] === '/entities/lookup-nip');
        handler = call?.[1];
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('rejestruje handler pod właściwą ścieżką', () => {
        expect(handler).toBeInstanceOf(Function);
    });

    it('NIP z niepoprawną sumą kontrolną -> 400, brak wywołania GusBirService', async () => {
        const res = makeRes();
        const next = jest.fn();

        await handler({ body: { nip: '1234567890' } }, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: expect.stringMatching(/NIP/) }),
        );
        expect(mockIsConfigured).not.toHaveBeenCalled();
        expect(mockLookupByNip).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it('poprawny NIP, brak GUS_BIR_KEY (isConfigured false) -> 503, brak wywołania lookupByNip', async () => {
        mockIsConfigured.mockReturnValue(false);
        const res = makeRes();
        const next = jest.fn();

        await handler({ body: { nip: '5261040567' } }, res, next);

        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
        expect(mockLookupByNip).not.toHaveBeenCalled();
    });

    it('poprawny NIP + skonfigurowany -> 200 z mapowanym obiektem', async () => {
        mockIsConfigured.mockReturnValue(true);
        mockLookupByNip.mockResolvedValue({
            name: 'T-MOBILE POLSKA SPÓŁKA AKCYJNA',
            address: 'ul. Test-Krucza 12, 02-674 Warszawa',
            regon: '011417295',
            krs: '0000391193',
        });
        const res = makeRes();
        const next = jest.fn();

        await handler({ body: { nip: '526-104-05-67' } }, res, next);

        expect(mockLookupByNip).toHaveBeenCalledWith('5261040567');
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'T-MOBILE POLSKA SPÓŁKA AKCYJNA' }),
        );
        expect(res.status).not.toHaveBeenCalledWith(400);
        expect(res.status).not.toHaveBeenCalledWith(503);
    });

    it('lookupByNip rzuca GusBirNotConfiguredError (wyścig env) -> 503', async () => {
        mockIsConfigured.mockReturnValue(true);
        const actual = jest.requireActual('../gusBir/GusBirService') as any;
        mockLookupByNip.mockRejectedValue(new actual.GusBirNotConfiguredError());
        const res = makeRes();
        const next = jest.fn();

        await handler({ body: { nip: '5261040567' } }, res, next);

        expect(res.status).toHaveBeenCalledWith(503);
    });

    it('lookupByNip rzuca GusBirNotFoundError -> 404', async () => {
        mockIsConfigured.mockReturnValue(true);
        const actual = jest.requireActual('../gusBir/GusBirService') as any;
        mockLookupByNip.mockRejectedValue(new actual.GusBirNotFoundError('5261040567'));
        const res = makeRes();
        const next = jest.fn();

        await handler({ body: { nip: '5261040567' } }, res, next);

        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('lookupByNip rzuca nieoczekiwany błąd -> next(error), brak 500 ręcznie', async () => {
        mockIsConfigured.mockReturnValue(true);
        mockLookupByNip.mockRejectedValue(new Error('ECONNRESET'));
        const res = makeRes();
        const next = jest.fn();

        await handler({ body: { nip: '5261040567' } }, res, next);

        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(res.status).not.toHaveBeenCalled();
    });

    it('brak nip w body -> 400 (normalizeNip -> pusty string -> checksum invalid)', async () => {
        const res = makeRes();
        const next = jest.fn();

        await handler({ body: {} }, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
    });
});
