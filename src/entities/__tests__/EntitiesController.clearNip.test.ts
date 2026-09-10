/**
 * GPO-2 / D-GPO-3 — czyszczenie NIP-u trasą edycji podmiotu.
 *
 * Pack GPO, checkpoint GPO-2:
 *   20_projects/Aplikacje/PS.APP.01/plans/2026-09-10-gpo-poprawki-po-packu-gus-plan.md
 *
 * Defekt zmierzony na produkcji w sesji GUS-5: `PUT /entity/:id` z pustym `taxNumber`
 * odpowiadał 200 i `taxNumber: null`, a w bazie zostawała stara wartość. Wynikało to
 * ze złożenia dwóch rzeczy, z których każda z osobna jest poprawna: konstruktor Entity
 * pomija pole, którego nie ma czym wypełnić, a UPDATE budowany jest z pól obecnych
 * w obiekcie. Puste pole nie było więc „skasuj", tylko „nie ruszaj".
 *
 * Dlatego poprawka jest dwuczęściowa i obie części mają tu własny test:
 *  1. puste pole NIP kasuje kolumnę wprost (wartość pusta w sensie bazy, `null` —
 *     pusty tekst zderzyłby się z kluczem unikalnym przy drugim takim podmiocie),
 *  2. odpowiedź trasy jest odczytem rekordu po zapisie, a nie powtórzeniem formularza.
 *
 * Bramka FIDmana (SYNC-P3) zostaje nietknięta: podmiot będący stroną umowy
 * synchronizowanej musi mieć poprawny NIP, więc czyszczenie ma mu się nie udać.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../tools/ToolsDb');
jest.mock('../../contracts/fidmanSync/FidmanSync');

import ToolsDb from '../../tools/ToolsDb';
import * as FidmanSync from '../../contracts/fidmanSync/FidmanSync';
import EntitiesController from '../EntitiesController';

/** Rekord, jaki odda odczyt po zapisie — z NIP-em już wyczyszczonym. */
const ROW_AFTER_CLEAR = {
    Id: 7,
    Name: 'INIKO Grupa MGGP',
    ShortName: 'INIKO',
    Address: 'ul. Testowa 1, 00-001 Warszawa',
    TaxNumber: null,
    Regon: null,
    Krs: null,
    Www: null,
    Email: null,
    Phone: null,
    GusStatus: 'NOT_CHECKED',
    GusCheckedAt: null,
    GusSnapshot: null,
};

describe('EntitiesController.edit — czyszczenie NIP-u (GPO-2, D-GPO-3)', () => {
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
                } catch (e) {
                    await mockConn.rollback();
                    throw e;
                }
            }
        );
        (ToolsDb.editInDb as any).mockResolvedValue(undefined);
        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([
            ROW_AFTER_CLEAR,
        ]);
        (FidmanSync.entityHasSyncedContract as any).mockResolvedValue(false);
    });

    /** Obiekt, który naprawdę poszedłby do UPDATE-a. */
    function savedEntity(): any {
        return (ToolsDb.editInDb as jest.Mock).mock.calls[0]?.[1];
    }

    it('KONTROLA NEGATYWNA: pusty NIP naprawdę trafia do zapisu jako wartość pusta', async () => {
        await EntitiesController.edit({
            id: 7,
            name: 'INIKO Grupa MGGP',
            taxNumber: '',
        } as any);

        const saved = savedEntity();
        // Klucz MUSI istnieć w obiekcie — pole nieobecne to dla UPDATE-a „nie ruszaj".
        expect(Object.keys(saved)).toContain('taxNumber');
        // null, nie pusty tekst: kolumna ma klucz unikalny, a '' powtórzyłoby się
        // przy drugim podmiocie bez numeru.
        expect(saved.taxNumber).toBeNull();
    });

    it('KONTROLA NEGATYWNA: odpowiedź trasy jest odczytem po zapisie, nie echem formularza', async () => {
        const result: any = await EntitiesController.edit({
            id: 7,
            name: 'INIKO Grupa MGGP',
            taxNumber: '',
        } as any);

        expect(result.taxNumber).toBeUndefined();
        // Odczyt naprawdę się odbył: w odpowiedzi są pola, których formularz nie zna.
        expect(result.gusStatus).toBe('NOT_CHECKED');
        expect(ToolsDb.getQueryCallbackAsync).toHaveBeenCalled();
    });

    it('NIP podany zwyczajnie dalej się zapisuje (normalizacja do 10 cyfr bez zmian)', async () => {
        await EntitiesController.edit({
            id: 7,
            name: 'INIKO Grupa MGGP',
            taxNumber: '747-191-75-75',
        } as any);

        expect(savedEntity().taxNumber).toBe('7471917575');
    });

    it('pole NIP w ogóle niepodane dalej znaczy „nie ruszaj"', async () => {
        await EntitiesController.edit({
            id: 7,
            name: 'INIKO Grupa MGGP',
        } as any);

        expect(Object.keys(savedEntity())).not.toContain('taxNumber');
    });

    it('strona umowy synchronizowanej z FIDmanem: czyszczenie NIP-u odmawia, nie czyści po cichu', async () => {
        (FidmanSync.entityHasSyncedContract as any).mockResolvedValue(true);

        await expect(
            EntitiesController.edit({
                id: 7,
                name: 'ATA - TECHNIK',
                taxNumber: '',
            } as any)
        ).rejects.toThrow(/NIP/);

        expect(mockConn.rollback).toHaveBeenCalledTimes(1);
        expect(ToolsDb.editInDb).not.toHaveBeenCalled();
    });
});
