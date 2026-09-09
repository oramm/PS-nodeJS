/**
 * GUS-4a — przyjęcie danych z rejestru GUS zasila kolejkę synchronizacji z FIDmanem.
 *
 * Dziura, którą ten plik zamyka, została zgłoszona przy GUS-2: `accept` zapisuje wąską
 * instrukcją i omija `EntitiesController.edit`, więc przyjęcie nazwy albo adresu dla
 * podmiotu będącego stroną umowy synchronizowanej z FIDmanem nigdy by tam nie dojechało.
 *
 * Wzorzec i styl przepisane z `EntitiesController.fidmanSync.test.ts` (SYNC-P1):
 * mock transakcji naprawdę odgrywa begin/commit/rollback, więc zdanie o atomowości
 * jest sprawdzane, a nie deklarowane.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../tools/ToolsDb');
jest.mock('../../contracts/fidmanSync/FidmanSync');

import ToolsDb from '../../tools/ToolsDb';
import * as FidmanSync from '../../contracts/fidmanSync/FidmanSync';
import EntitiesController from '../EntitiesController';

/** Podmiot po sprawdzeniu w GUS: ma zapisaną migawkę, więc jest co przyjmować. */
const ROW_WITH_SNAPSHOT = {
    Id: 7,
    Name: 'MPWiK Będzin',
    ShortName: 'MPWiK BE',
    Address: 'ul. Kościuszki 140, 42-500 Będzin',
    TaxNumber: '7471917575',
    Regon: null,
    Krs: null,
    Www: null,
    Email: null,
    Phone: null,
    GusStatus: 'DIFF_MINOR',
    GusCheckedAt: new Date('2026-09-09T10:00:00Z'),
    GusSnapshot: JSON.stringify({
        name: 'MIEJSKIE PRZEDSIĘBIORSTWO WODOCIĄGÓW I KANALIZACJI SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
        address: 'ul. Tadeusza Kościuszki 140, 42-500 Będzin',
        regon: '271984661',
    }),
};

describe('EntitiesController.gusAccept — kolejka FIDmana (GUS-4a)', () => {
    let mockConn: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockConn = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
        };
        (ToolsDb.transaction as jest.Mock).mockImplementation(
            async (cb: any) => {
                await mockConn.beginTransaction();
                try {
                    const result = await cb(mockConn);
                    await mockConn.commit();
                    return result;
                } catch (error) {
                    await mockConn.rollback();
                    throw error;
                }
            }
        );
        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([
            ROW_WITH_SNAPSHOT,
        ]);
        (ToolsDb.executeSQL as any).mockResolvedValue({});
    });

    it('strona umowy synchronizowanej z FIDmanem: wpis do kolejki tym samym połączeniem, dostarczenie po commicie', async () => {
        (FidmanSync.entityHasSyncedContract as any).mockResolvedValue(true);
        let enqueueConn: any;
        let enqueuedEntity: any;
        (FidmanSync.enqueueFidmanEntityPush as any).mockImplementation(
            async (entity: any, conn: any) => {
                enqueueConn = conn;
                enqueuedEntity = { ...entity };
                return 555;
            }
        );
        (FidmanSync.tryDeliverAfterCommit as any).mockResolvedValue(undefined);

        const result = await EntitiesController.gusAccept(7, [
            'name',
            'address',
        ]);

        expect(result.ok).toBe(true);
        expect(FidmanSync.entityHasSyncedContract).toHaveBeenCalledWith(
            7,
            mockConn
        );
        expect(enqueueConn).toBe(mockConn);
        // Do FIDmana idzie podmiot JUŻ po przyjęciu, nie sprzed niego.
        expect(enqueuedEntity.name).toContain('MIEJSKIE PRZEDSIĘBIORSTWO');
        expect(enqueuedEntity.address).toContain('Tadeusza Kościuszki');
        expect(mockConn.commit).toHaveBeenCalledTimes(1);
        expect(mockConn.rollback).not.toHaveBeenCalled();
        expect(FidmanSync.tryDeliverAfterCommit).toHaveBeenCalledWith(555);
    });

    it('podmiot spoza synchronizacji: zapis idzie, kolejka nietknięta', async () => {
        (FidmanSync.entityHasSyncedContract as any).mockResolvedValue(false);

        const result = await EntitiesController.gusAccept(7, ['name']);

        expect(result.ok).toBe(true);
        expect(FidmanSync.enqueueFidmanEntityPush).not.toHaveBeenCalled();
        expect(FidmanSync.tryDeliverAfterCommit).not.toHaveBeenCalled();
        expect(mockConn.commit).toHaveBeenCalledTimes(1);
    });

    it('przyjęcie samego REGON-u nie rusza kolejki — synchronizacja go nie przenosi', async () => {
        (FidmanSync.entityHasSyncedContract as any).mockResolvedValue(true);

        const result = await EntitiesController.gusAccept(7, ['regon']);

        expect(result.ok).toBe(true);
        expect(FidmanSync.entityHasSyncedContract).not.toHaveBeenCalled();
        expect(FidmanSync.enqueueFidmanEntityPush).not.toHaveBeenCalled();
    });

    it('awaria wysyłki po commicie nie wywraca przyjęcia', async () => {
        (FidmanSync.entityHasSyncedContract as any).mockResolvedValue(true);
        (FidmanSync.enqueueFidmanEntityPush as any).mockResolvedValue(777);
        (FidmanSync.tryDeliverAfterCommit as any).mockRejectedValue(
            new Error('FIDman nie odpowiada')
        );

        const result = await EntitiesController.gusAccept(7, ['name']);

        expect(result.ok).toBe(true);
        expect(mockConn.commit).toHaveBeenCalledTimes(1);
        expect(mockConn.rollback).not.toHaveBeenCalled();
    });

    it('błąd w środku transakcji cofa zapis i nic nie wysyła', async () => {
        (FidmanSync.entityHasSyncedContract as any).mockRejectedValue(
            new Error('baza padła')
        );

        await expect(EntitiesController.gusAccept(7, ['name'])).rejects.toThrow(
            'baza padła'
        );

        expect(mockConn.rollback).toHaveBeenCalledTimes(1);
        expect(mockConn.commit).not.toHaveBeenCalled();
        expect(FidmanSync.tryDeliverAfterCommit).not.toHaveBeenCalled();
    });
});
