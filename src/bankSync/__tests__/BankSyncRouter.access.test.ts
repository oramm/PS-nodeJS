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
        use: jest.fn(),
    },
    upload: { single: () => (_req: any, _res: any, next: any) => next() },
}));

jest.mock('../BankSyncController', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({})),
    BankSyncError: class BankSyncError extends Error {},
}));
jest.mock('../BankTransferRepository', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../PaymentAllocationRepository', () => ({
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({})),
}));

const mockHasBankAccess = jest.fn<(...args: any[]) => any>();
jest.mock('../../staff/StaffMemberRepository', () => ({
    __esModule: true,
    default: {
        hasBankAccess: (...args: any[]) => mockHasBankAccess(...args),
    },
}));

function makeRes() {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

function reqWith(userData: any) {
    return { session: userData ? { userData } : {} } as any;
}

const ADMIN = { systemRoleName: 'ADMIN', enviId: 1 };
const EMPLOYEE = { systemRoleName: 'ENVI_EMPLOYEE', enviId: 7 };

describe('BankSyncRouter - bramka dostępu do modułu', () => {
    let guard: any;
    let accessHandler: any;
    let guardedPrefixes: string[];
    // Kolejność rejestracji odczytana od razu przy require - `clearMocks` z jest.config
    // czyści mock.calls przed każdym testem, więc w samym teście już jej nie ma.
    let guardOrder: number | undefined;
    let accessOrder: number | undefined;

    beforeAll(() => {
        require('../BankSyncRouter');
        const useMock = app.use as unknown as jest.Mock;
        guardedPrefixes = useMock.mock.calls.map((c: any) => c[0]);
        const guardIndex = useMock.mock.calls.findIndex(
            (c: any) => c[0] === '/bank-transfers',
        );
        guard = useMock.mock.calls[guardIndex]?.[1];
        guardOrder = useMock.mock.invocationCallOrder[guardIndex];

        const getMock = app.get as unknown as jest.Mock;
        const accessIndex = getMock.mock.calls.findIndex(
            (c: any) => c[0] === '/bank-transfers/access',
        );
        accessHandler = getMock.mock.calls[accessIndex]?.[1];
        accessOrder = getMock.mock.invocationCallOrder[accessIndex];
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('bramkuje oba prefiksy modułu: wyciągi i przelewy', () => {
        expect(guardedPrefixes).toEqual(
            expect.arrayContaining(['/bank-statements', '/bank-transfers']),
        );
        expect(guard).toBeInstanceOf(Function);
    });

    it('/bank-transfers/access jest zarejestrowane PRZED bramką (inaczej menu dostawałoby 403)', () => {
        expect(accessOrder).toBeLessThan(guardOrder as number);
    });

    it('brak sesji -> 401 i nie pyta bazy o flagę', async () => {
        const res = makeRes();
        const next = jest.fn();
        await guard(reqWith(null), res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
        expect(mockHasBankAccess).not.toHaveBeenCalled();
    });

    it('flaga ustawiona -> przepuszcza', async () => {
        mockHasBankAccess.mockResolvedValue(true as never);
        const res = makeRes();
        const next = jest.fn();
        await guard(reqWith(EMPLOYEE), res, next);
        expect(mockHasBankAccess).toHaveBeenCalledWith(7);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('flaga zdjęta -> 403, mimo roli pracownika ENVI', async () => {
        mockHasBankAccess.mockResolvedValue(false as never);
        const res = makeRes();
        const next = jest.fn();
        await guard(reqWith(EMPLOYEE), res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('ADMIN wchodzi bez flagi (bezpiecznik przed zablokowaniem sobie modułu)', async () => {
        mockHasBankAccess.mockResolvedValue(false as never);
        const res = makeRes();
        const next = jest.fn();
        await guard(reqWith(ADMIN), res, next);
        expect(next).toHaveBeenCalled();
        expect(mockHasBankAccess).not.toHaveBeenCalled();
    });

    it('/bank-transfers/access zwraca stan flagi zamiast 403', async () => {
        mockHasBankAccess.mockResolvedValue(false as never);
        const res = makeRes();
        await accessHandler(reqWith(EMPLOYEE), res, jest.fn());
        expect(res.json).toHaveBeenCalledWith({ hasAccess: false });
        expect(res.status).not.toHaveBeenCalled();
    });
});
