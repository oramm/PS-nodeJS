/**
 * GUS-3 — trasy POST /entities/gus/sweep i GET /entities/gus/report.
 *
 * Dwie rzeczy do przypilnowania:
 *  - obie trasy stoją za bramką panelu administracyjnego (przebieg pyta zewnętrzny rejestr
 *    kilkaset razy i przestawia status całemu słownikowi — to nie jest czynność dla
 *    dowolnego zalogowanego pracownika),
 *  - obie są zarejestrowane PRZED trasami z `:id`. Zmierzone zachowanie Expressa 4.21 mówi,
 *    że kolizji nie ma (trzy segmenty kontra cztery), ale kolejność jest zabezpieczeniem
 *    na wypadek dopisania kiedyś trasy `/entities/:id`.
 */
/// <reference types="jest" />
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { app } from '../../index';

jest.mock('../../index', () => ({
    app: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const mockRunGusSweep = jest.fn<(...args: any[]) => any>();
const mockBuildGusReport = jest.fn<(...args: any[]) => any>();
jest.mock('../gusBir/GusSweep', () => ({
    __esModule: true,
    runGusSweep: (...args: any[]) => mockRunGusSweep(...args),
}));
jest.mock('../gusBir/GusReport', () => ({
    __esModule: true,
    buildGusReport: (...args: any[]) => mockBuildGusReport(...args),
}));
jest.mock('../EntitiesController', () => ({
    __esModule: true,
    default: { gusCheck: jest.fn(), gusAccept: jest.fn() },
}));

function makeRes() {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.send = jest.fn().mockReturnValue(res);
    return res;
}

const ADMIN = { session: { userData: { systemRoleName: 'ADMIN' } } };
const PRACOWNIK = { session: { userData: { systemRoleName: 'ENVI_EMPLOYEE' } } };

describe('EntitiesRouters — przebieg i zestawienie GUS (GUS-3)', () => {
    let sweepCall: any[];
    let reportCall: any[];
    let postCalls: any[];

    beforeAll(() => {
        require('../EntitiesRouters');
        postCalls = (app.post as jest.Mock).mock.calls as any[];
        sweepCall = postCalls.find((c: any) => c[0] === '/entities/gus/sweep')!;
        reportCall = ((app.get as jest.Mock).mock.calls as any[]).find(
            (c: any) => c[0] === '/entities/gus/report'
        )!;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('obie trasy są zarejestrowane z bramką i handlerem', () => {
        expect(sweepCall).toBeDefined();
        expect(reportCall).toBeDefined();
        // [ścieżka, bramka, handler] — bramka musi być, inaczej trasa jest otwarta
        expect(sweepCall).toHaveLength(3);
        expect(reportCall).toHaveLength(3);
    });

    it('sweep jest zarejestrowany przed trasami z :id', () => {
        const indexSweep = postCalls.findIndex(
            (c: any) => c[0] === '/entities/gus/sweep'
        );
        const indexCheck = postCalls.findIndex(
            (c: any) => c[0] === '/entities/:id/gus/check'
        );
        expect(indexSweep).toBeGreaterThanOrEqual(0);
        expect(indexCheck).toBeGreaterThan(indexSweep);
    });

    it('bramka odrzuca pracownika bez roli administratora', () => {
        const guard = sweepCall[1];
        const res = makeRes();
        const next = jest.fn();
        guard(PRACOWNIK as any, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('bramka przepuszcza administratora', () => {
        const guard = sweepCall[1];
        const res = makeRes();
        const next = jest.fn();
        guard(ADMIN as any, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
    });

    it('sweep: wynik przebiegu wraca jako 200', async () => {
        mockRunGusSweep.mockResolvedValue({ checked: 20, remaining: 365 });
        const res = makeRes();
        await sweepCall[2]({ body: {} }, res, jest.fn());
        expect(mockRunGusSweep).toHaveBeenCalledWith(undefined);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ remaining: 365 })
        );
    });

    it('sweep: limit spoza liczb dodatnich -> 400 bez ruszania bazy', async () => {
        const res = makeRes();
        await sweepCall[2]({ body: { limit: 0 } }, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(mockRunGusSweep).not.toHaveBeenCalled();
    });

    it('report: cztery listy wracają jako 200', async () => {
        mockBuildGusReport.mockResolvedValue({
            duplicateNips: [],
            withoutNip: [],
            closed: [],
            diff: [],
        });
        const res = makeRes();
        await reportCall[2]({}, res, jest.fn());
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({ duplicateNips: [], withoutNip: [] })
        );
    });
});
