/**
 * GUS-2 — trasy POST /entities/:id/gus/check i /gus/accept. Ten sam sposób mockowania
 * co EntitiesRouters.lookupNip.test.ts: `app` zamockowany, handler wyjęty z argumentów
 * i wołany wprost.
 *
 * Trasa pilnuje dwóch rzeczy, których kontroler nie widzi: numeru podmiotu w adresie
 * i tego, że do przyjęcia wchodzą wyłącznie nazwy pól z zamkniętej listy.
 */
/// <reference types="jest" />
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { app } from '../../index';

jest.mock('../../index', () => ({
    app: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const mockGusCheck = jest.fn<(...args: any[]) => any>();
const mockGusAccept = jest.fn<(...args: any[]) => any>();
jest.mock('../EntitiesController', () => ({
    __esModule: true,
    default: {
        gusCheck: (...args: any[]) => mockGusCheck(...args),
        gusAccept: (...args: any[]) => mockGusAccept(...args),
    },
}));

function makeRes() {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
}

describe('EntitiesRouters — trasy GUS dla jednego podmiotu', () => {
    let checkHandler: any;
    let acceptHandler: any;

    beforeAll(() => {
        require('../EntitiesRouters');
        const postMock = app.post as jest.Mock;
        checkHandler = postMock.mock.calls.find(
            (c: any) => c[0] === '/entities/:id/gus/check'
        )?.[1];
        acceptHandler = postMock.mock.calls.find(
            (c: any) => c[0] === '/entities/:id/gus/accept'
        )?.[1];
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('obie trasy są zarejestrowane', () => {
        expect(checkHandler).toBeInstanceOf(Function);
        expect(acceptHandler).toBeInstanceOf(Function);
    });

    it('check: wynik kontrolera wraca jako 200', async () => {
        mockGusCheck.mockResolvedValue({ ok: true, id: 1, status: 'OK' });
        const res = makeRes();
        await checkHandler({ params: { id: '1' }, body: {} }, res, jest.fn());
        expect(mockGusCheck).toHaveBeenCalledWith(1);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'OK' })
        );
        expect(res.status).not.toHaveBeenCalled();
    });

    it('check: nieznany podmiot -> 404', async () => {
        mockGusCheck.mockResolvedValue({
            ok: false,
            reason: 'ENTITY_NOT_FOUND',
            message: 'Nie ma podmiotu o numerze 999',
        });
        const res = makeRes();
        await checkHandler({ params: { id: '999' }, body: {} }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(404);
    });

    it('check: brak NIP-u -> 400', async () => {
        mockGusCheck.mockResolvedValue({
            ok: false,
            reason: 'NO_USABLE_NIP',
            message: 'brak NIP-u',
        });
        const res = makeRes();
        await checkHandler({ params: { id: '1' }, body: {} }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
    });

    it('check: brak klucza GUS -> 503', async () => {
        mockGusCheck.mockResolvedValue({
            ok: false,
            reason: 'GUS_NOT_CONFIGURED',
            message: 'brak GUS_BIR_KEY',
        });
        const res = makeRes();
        await checkHandler({ params: { id: '1' }, body: {} }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(503);
    });

    it('check: numer podmiotu nie do odczytania -> 400 bez wołania kontrolera', async () => {
        const res = makeRes();
        await checkHandler({ params: { id: 'abc' }, body: {} }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockGusCheck).not.toHaveBeenCalled();
    });

    it('check: nieoczekiwany błąd idzie do next(), nie do odpowiedzi', async () => {
        mockGusCheck.mockRejectedValue(new Error('coś padło'));
        const res = makeRes();
        const next = jest.fn();
        await checkHandler({ params: { id: '1' }, body: {} }, res, next);
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(res.status).not.toHaveBeenCalled();
    });

    it('accept: do kontrolera idą wyłącznie pola z zamkniętej listy', async () => {
        mockGusAccept.mockResolvedValue({ ok: true, id: 1, applied: ['name'] });
        const res = makeRes();
        await acceptHandler(
            { params: { id: '1' }, body: { fields: ['name', 'taxNumber', 'shortName'] } },
            res,
            jest.fn()
        );
        expect(mockGusAccept).toHaveBeenCalledWith(1, ['name']);
    });

    it('accept: puste albo brakujące pola -> 400 bez wołania kontrolera', async () => {
        const res = makeRes();
        await acceptHandler({ params: { id: '1' }, body: {} }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockGusAccept).not.toHaveBeenCalled();
    });

    it('accept: podmiot bez migawki -> 400', async () => {
        mockGusAccept.mockResolvedValue({
            ok: false,
            reason: 'NO_SNAPSHOT',
            message: 'najpierw sprawdź',
        });
        const res = makeRes();
        await acceptHandler(
            { params: { id: '1' }, body: { fields: ['name'] } },
            res,
            jest.fn()
        );
        expect(res.status).toHaveBeenCalledWith(400);
    });
});
