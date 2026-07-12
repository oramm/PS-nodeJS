/// <reference types="jest" />
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { app } from '../../index';

jest.mock('../../index', () => ({
    app: {
        get: jest.fn(),
        post: jest.fn(),
        patch: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
    },
}));

// Instancja kontrolera tworzona w routerze — podmieniamy metody na mocki.
const mockCheckWhiteList = jest.fn<(...args: any[]) => any>();
jest.mock('../CostInvoiceController', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
        checkWhiteList: mockCheckWhiteList,
    })),
}));

function makeRes() {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

describe('CostInvoicesRouter — POST /cost-invoices/:id/white-list/check (walidacja daty)', () => {
    let handler: any;

    beforeAll(() => {
        require('../CostInvoicesRouter');
        const postMock = app.post as jest.Mock;
        const call = postMock.mock.calls.find(
            (c: any) => c[0] === '/cost-invoices/:id/white-list/check',
        );
        handler = call?.[1];
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    function authedReq(body: any) {
        return {
            params: { id: '5' },
            body,
            session: { userData: { systemRoleName: 'ADMIN', enviId: 1 } },
        } as any;
    }

    it('rejestruje handler pod właściwą ścieżką', () => {
        expect(handler).toBeInstanceOf(Function);
    });

    it('FUTURE DATE -> 400 i NIE wywołuje KAS (controller.checkWhiteList)', async () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const res = makeRes();

        await handler(authedReq({ date: tomorrow.toISOString() }), res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ error: expect.stringMatching(/przyszłości/) }),
        );
        expect(mockCheckWhiteList).not.toHaveBeenCalled();
    });

    it('data dzisiejsza jest akceptowana (wywołuje checkWhiteList)', async () => {
        mockCheckWhiteList.mockResolvedValue({
            whiteListStatus: 'VERIFIED_OK',
            toJson: () => ({ id: 5, whiteListStatus: 'VERIFIED_OK' }),
        } as any);
        const res = makeRes();

        await handler(authedReq({ date: new Date().toISOString() }), res, jest.fn());

        expect(mockCheckWhiteList).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalledWith(400);
    });

    it('brak daty -> akceptowane (domyślnie dziś), wywołuje checkWhiteList bez asOfDate', async () => {
        mockCheckWhiteList.mockResolvedValue({
            whiteListStatus: 'VERIFIED_OK',
            toJson: () => ({ id: 5, whiteListStatus: 'VERIFIED_OK' }),
        } as any);
        const res = makeRes();

        await handler(authedReq({}), res, jest.fn());

        expect(mockCheckWhiteList).toHaveBeenCalledWith(5, undefined);
    });

    it('niepoprawna data -> 400', async () => {
        const res = makeRes();

        await handler(authedReq({ date: 'not-a-date' }), res, jest.fn());

        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockCheckWhiteList).not.toHaveBeenCalled();
    });
});
