/**
 * WYK-2 zadanie 4 — trasa `POST /contract/:id/fidmanSync/retry`.
 *
 * Sedno: to trasa składa żywą umowę (`ContractsController.find`) i ona tłumaczy odmowę
 * bramki na kod HTTP. Moduł syncu został liściem i kontrolera nie importuje, więc bez tego
 * testu nikt nie sprawdza, czy umowa w ogóle zostaje wczytana i czy odmowa dociera do
 * przeglądarki jako czytelne zdanie, a nie jako 500.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const postMockRegistry: any[] = [];

jest.mock('../../../index', () => ({
    app: {
        get: jest.fn(),
        post: jest.fn((path: string, handler: any) =>
            postMockRegistry.push([path, handler])
        ),
    },
}));

jest.mock('../../ContractsController', () => ({
    __esModule: true,
    default: { find: jest.fn() },
}));

jest.mock('../FidmanSync', () => ({
    __esModule: true,
    getFidmanContractSyncStatus: jest.fn(),
    getFidmanNipGapReport: jest.fn(),
    retryOrPushFidmanContract: jest.fn(),
}));

import ContractsController from '../../ContractsController';
import { retryOrPushFidmanContract } from '../FidmanSync';
import '../FidmanSyncRouters';

function getRetryHandler() {
    const entry = postMockRegistry.find(
        ([path]) => path === '/contract/:id/fidmanSync/retry'
    );
    if (!entry) throw new Error('Trasa dopchnięcia nie została zarejestrowana');
    return entry[1];
}

function makeRes() {
    const res: any = {
        statusCode: 200,
        body: undefined as any,
        status: jest.fn(function (this: any, code: number) {
            res.statusCode = code;
            return res;
        }),
        send: jest.fn((body: any) => {
            res.body = body;
            return res;
        }),
    };
    return res;
}

describe('POST /contract/:id/fidmanSync/retry', () => {
    beforeEach(() => {
        (ContractsController.find as any).mockReset();
        (retryOrPushFidmanContract as any).mockReset();
    });

    it('umowa wykluczona (bramka odmawia): odpowiada 409 z powodem w polu `error`, tym samym, który zwróciła bramka', async () => {
        (ContractsController.find as any).mockResolvedValue([
            { id: 5, typeId: 3, fidmanSyncEnabled: false },
        ]);
        (retryOrPushFidmanContract as any).mockResolvedValue({
            ok: false,
            reason: 'NOT_ELIGIBLE',
            message: 'Umowa nie jest objęta synchronizacją z FIDmanem.',
        });

        const res = makeRes();
        await getRetryHandler()({ params: { id: '5' } }, res, jest.fn());

        expect(res.statusCode).toBe(409);
        expect(res.body).toEqual({
            error: 'Umowa nie jest objęta synchronizacją z FIDmanem.',
        });
    });

    it('nie ma umowy o takim identyfikatorze: odpowiada 404 i nie woła bramki dopchnięcia', async () => {
        (ContractsController.find as any).mockResolvedValue([]);

        const res = makeRes();
        await getRetryHandler()({ params: { id: '99999' } }, res, jest.fn());

        expect(res.statusCode).toBe(404);
        expect(res.body).toMatchObject({ error: expect.any(String) });
        expect(retryOrPushFidmanContract as any).not.toHaveBeenCalled();
    });

    it('umowa objęta synchronizacją: przekazuje bramce umowę wczytaną razem ze stronami i odsyła status bez ustawiania kodu błędu', async () => {
        const contract = {
            id: 5,
            typeId: 3,
            fidmanSyncEnabled: true,
            _employers: [{ id: 501, name: 'Gmina Testowa' }],
        };
        (ContractsController.find as any).mockResolvedValue([contract]);
        (retryOrPushFidmanContract as any).mockResolvedValue({
            ok: true,
            status: { contractId: 5, status: 'SENT' },
        });

        const res = makeRes();
        await getRetryHandler()({ params: { id: '5' } }, res, jest.fn());

        expect(ContractsController.find as any).toHaveBeenCalledWith([{ id: 5 }]);
        expect(retryOrPushFidmanContract as any).toHaveBeenCalledWith(contract);
        expect(res.status).not.toHaveBeenCalled();
        expect(res.body).toEqual({ contractId: 5, status: 'SENT' });
    });
});
