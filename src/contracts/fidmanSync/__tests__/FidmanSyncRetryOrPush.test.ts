/**
 * WYK-2 zadanie 4 — pełna akcja „dopchnij synchronizację" (`retryOrPushFidmanContract`).
 *
 * To jest warunek, pod którym właściciel zgodził się na „nowa umowa domyślnie wykluczona"
 * (`Q-WYK-1`): skoro zaznaczenie kratki jest jedyną drogą do FIDmana, musi istnieć sposób
 * dopchnięcia umowy, która nigdy nie poszła — a dzisiejsza akcja umiała tylko ponowić
 * istniejący nieudany wpis.
 *
 * Testy są bez bazy (ToolsDb zamockowany), ale kolejka jest tu pamięciowa i mutują ją
 * DOKŁADNIE te zapytania, które wysyła prawdziwy kod (`enqueueRow`, `deliverOutboxRow`).
 * Dzięki temu zdanie „nie powstał żaden wpis" jest sprawdzalne, a nie deklarowane:
 * `inserted` rośnie tylko wtedy, gdy kod naprawdę wykonał INSERT do FidmanSyncOutbox.
 */

import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';

jest.mock('../../../tools/ToolsDb');

import ToolsDb from '../../../tools/ToolsDb';
import {
    retryOrPushFidmanContract,
    FIDMAN_NOT_ELIGIBLE_MESSAGE,
} from '../FidmanSync';

const CONTRACT_ID = 4242;
const NEW_OUTBOX_ID = 901;
const OLD_OUTBOX_ID = 77;

const ORIG_BASE = process.env.FIDMAN_SYNC_BASE_URL;
const ORIG_TOKEN = process.env.FIDMAN_SYNC_TOKEN;
const ORIG_TYPES = process.env.FIDMAN_SYNC_CONTRACT_TYPE_IDS;

type OutboxState = {
    Id: number;
    Kind: string;
    RefId: number;
    Payload: any;
    Status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
    SkipReason: string | null;
    LastError: string | null;
    Attempts: number;
};

/** Umowa taka, jaką zwraca `ContractsController.find([{ id }])` — razem ze stronami. */
function makeContract(over: Partial<Record<string, any>> = {}) {
    return {
        id: CONTRACT_ID,
        typeId: 3, // „Żółty" — typ z domyślnej allowlisty FIDMAN_SYNC_CONTRACT_TYPE_IDS
        fidmanSyncEnabled: true,
        number: 'ZP/7/2026',
        name: 'Budowa oczyszczalni',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        _project: { id: 11, ourId: '2026.01', name: 'Modernizacja sieci' },
        _employers: [
            { id: 501, name: 'Gmina Testowa', taxNumber: '5260250995' },
        ],
        _engineers: [],
        _contractors: [],
        ...over,
    } as any;
}

describe('retryOrPushFidmanContract — „dopchnij synchronizację" (WYK-2 zadanie 4)', () => {
    /** Wiersze, które kod NAPRAWDĘ wstawił do FidmanSyncOutbox w tym teście. */
    let inserted: { kind: string; refId: number; payload: any }[];
    /** Najnowszy wiersz kolejki dla tej umowy, albo `null` gdy kolejka jest dla niej pusta. */
    let latest: OutboxState | null;
    let connExecute: jest.Mock;
    let fetchMock: jest.Mock;

    beforeEach(() => {
        process.env.FIDMAN_SYNC_BASE_URL = 'https://fidman.example';
        process.env.FIDMAN_SYNC_TOKEN = 'tok';
        process.env.FIDMAN_SYNC_CONTRACT_TYPE_IDS = '3,4';

        inserted = [];
        latest = null;

        connExecute = jest.fn<any>(async (sql: string, params: any[]) => {
            if (/INSERT INTO FidmanSyncOutbox/.test(sql)) {
                inserted.push({
                    kind: params[0],
                    refId: params[1],
                    payload: JSON.parse(params[2]),
                });
                latest = {
                    Id: NEW_OUTBOX_ID,
                    Kind: params[0],
                    RefId: params[1],
                    Payload: JSON.parse(params[2]),
                    Status: 'PENDING',
                    SkipReason: null,
                    LastError: null,
                    Attempts: 0,
                };
                return [{ insertId: NEW_OUTBOX_ID }, undefined];
            }
            return [{}, undefined];
        });

        (ToolsDb.transaction as any).mockReset();
        (ToolsDb.transaction as any).mockImplementation(async (cb: any) =>
            cb({ execute: connExecute })
        );

        (ToolsDb.getQueryCallbackAsync as any).mockReset();
        (ToolsDb.getQueryCallbackAsync as any).mockImplementation(
            async (sql: string) => {
                if (sql.includes("Status IN ('FAILED', 'SKIPPED')")) {
                    return latest &&
                        (latest.Status === 'FAILED' ||
                            latest.Status === 'SKIPPED')
                        ? [latest]
                        : [];
                }
                // tryDeliverAfterCommit pobiera świeżo wstawiony wiersz po Id
                if (sql.includes('WHERE Id = ?')) return latest ? [latest] : [];
                // odczyt statusu (Kind + RefId, bez filtra po Status)
                return latest ? [latest] : [];
            }
        );

        (ToolsDb.executeSQL as any).mockReset();
        (ToolsDb.executeSQL as any).mockImplementation(async (sql: string) => {
            if (!latest) return {};
            if (sql.includes("Status = 'SENT'")) {
                latest.Status = 'SENT';
                latest.LastError = null;
            } else if (sql.includes("Status = 'SKIPPED'")) {
                latest.Status = 'SKIPPED';
            } else if (sql.includes("Status = 'FAILED'")) {
                latest.Status = 'FAILED';
                latest.Attempts += 1;
            }
            return {};
        });

        fetchMock = jest.fn<any>().mockResolvedValue({
            status: 200,
            json: async () => ({ created: 1, updated: 0, skipped: [] }),
            text: async () => '',
        });
        (global as any).fetch = fetchMock;
    });

    afterAll(() => {
        const restore = (key: string, value: string | undefined) => {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        };
        restore('FIDMAN_SYNC_BASE_URL', ORIG_BASE);
        restore('FIDMAN_SYNC_TOKEN', ORIG_TOKEN);
        restore('FIDMAN_SYNC_CONTRACT_TYPE_IDS', ORIG_TYPES);
    });

    it('umowa objęta synchronizacją, bez ani jednego wpisu w kolejce: wstawia nowy wiersz contract.upsert z ładunkiem złożonym z żywej umowy (ze stronami) i wysyła go', async () => {
        const result = await retryOrPushFidmanContract(makeContract());

        expect(inserted).toHaveLength(1);
        expect(inserted[0].kind).toBe('contract.upsert');
        expect(inserted[0].refId).toBe(CONTRACT_ID);
        // Ładunek pochodzi z ŻYWEJ umowy, nie z migawki — stąd numer, daty i strony.
        expect(inserted[0].payload).toMatchObject({
            legacyContractId: CONTRACT_ID,
            number: 'ZP/7/2026',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
        });
        expect(inserted[0].payload.entities).toEqual([
            expect.objectContaining({
                legacyEntityId: 501,
                name: 'Gmina Testowa',
                role: 'EMPLOYER',
            }),
        ]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.status.status).toBe('SENT');
    });

    it('umowa objęta synchronizacją, której ostatnia wysyłka się UDAŁA (wpis SENT, brak FAILED/SKIPPED): mimo to wstawia nowy wiersz i wysyła', async () => {
        latest = {
            Id: OLD_OUTBOX_ID,
            Kind: 'contract.upsert',
            RefId: CONTRACT_ID,
            Payload: { legacyContractId: CONTRACT_ID, entities: [] },
            Status: 'SENT',
            SkipReason: null,
            LastError: null,
            Attempts: 0,
        };

        const result = await retryOrPushFidmanContract(makeContract());

        expect(inserted).toHaveLength(1);
        expect(inserted[0].refId).toBe(CONTRACT_ID);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result.ok).toBe(true);
    });

    it('umowa objęta synchronizacją z istniejącym wpisem FAILED: ponawia TEN wpis i NIE wstawia nowego (zastane zachowanie nietknięte)', async () => {
        latest = {
            Id: OLD_OUTBOX_ID,
            Kind: 'contract.upsert',
            RefId: CONTRACT_ID,
            Payload: { legacyContractId: CONTRACT_ID, entities: [] },
            Status: 'FAILED',
            SkipReason: null,
            LastError: 'HTTP 500',
            Attempts: 2,
        };

        const result = await retryOrPushFidmanContract(makeContract());

        expect(inserted).toHaveLength(0);
        expect(ToolsDb.transaction as any).not.toHaveBeenCalled();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.status.status).toBe('SENT');
    });

    // ================= KONTROLA NEGATYWNA =================

    it('umowa wykluczona znacznikiem: odmawia z czytelnym powodem i NIE wstawia wiersza do kolejki ani nie wysyła żądania', async () => {
        const result = await retryOrPushFidmanContract(
            makeContract({ fidmanSyncEnabled: false })
        );

        expect(result).toEqual({
            ok: false,
            reason: 'NOT_ELIGIBLE',
            message: FIDMAN_NOT_ELIGIBLE_MESSAGE,
        });
        // Powód ma być zdaniem dla człowieka, nie kodem — front wstawia go do alertu werbatim.
        expect(FIDMAN_NOT_ELIGIBLE_MESSAGE).toMatch(/Objęta synchronizacją/);
        // Sama odmowa niczego nie dowodzi — sprawdzamy, że kolejka jest nietknięta.
        expect(inserted).toHaveLength(0);
        expect(ToolsDb.transaction as any).not.toHaveBeenCalled();
        expect(connExecute).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('umowa bez znacznika w ogóle (pole undefined, np. wiersz z zapytania bez tej kolumny): odmawia i NIE wstawia wiersza do kolejki', async () => {
        const contract = makeContract();
        delete (contract as any).fidmanSyncEnabled;

        const result = await retryOrPushFidmanContract(contract);

        expect(result.ok).toBe(false);
        expect(inserted).toHaveLength(0);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('umowa ze znacznikiem, ale o typie spoza allowlisty syncu: odmawia i NIE wstawia wiersza do kolejki', async () => {
        const result = await retryOrPushFidmanContract(
            makeContract({ typeId: 8, fidmanSyncEnabled: true })
        );

        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.reason).toBe('NOT_ELIGIBLE');
        expect(inserted).toHaveLength(0);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('umowa wykluczona, która ma zastany martwy wpis FAILED: odmawia i NIE ponawia tego wpisu — wykluczenie stoi przed kolejką', async () => {
        // To są te wiersze FAILED z produkcji należące do umów przeznaczonych do
        // usunięcia (pomiar 2026-08-25: pięć z sześciu; zamknięte w WYK-3, ale kolejny taki
        // wiersz powstanie tak samo). Gdyby bramka stała za odczytem kolejki, jedno kliknięcie „dopchnij"
        // odtworzyłoby taką umowę w FIDmanie — czyli dokładnie to, czemu pack zapobiega.
        latest = {
            Id: OLD_OUTBOX_ID,
            Kind: 'contract.upsert',
            RefId: CONTRACT_ID,
            Payload: { legacyContractId: CONTRACT_ID, entities: [] },
            Status: 'FAILED',
            SkipReason: null,
            LastError: 'HTTP 500',
            Attempts: 10,
        };

        const result = await retryOrPushFidmanContract(
            makeContract({ fidmanSyncEnabled: false })
        );

        expect(result.ok).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(inserted).toHaveLength(0);
        expect(latest!.Status).toBe('FAILED'); // wiersz nietknięty
    });
});
