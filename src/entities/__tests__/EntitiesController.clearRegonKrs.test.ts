/**
 * REG-1 / D-REG-1 — czyszczenie REGON-u i KRS-u trasą edycji podmiotu.
 *
 * Pack REG, checkpoint REG-1:
 *   20_projects/Aplikacje/PS.APP.01/plans/2026-09-10-reg-czyszczenie-regonu-i-krs-plan.md
 *
 * Ta sama wada, którą dla NIP-u naprawił pack GPO (`EntitiesController.clearNip.test.ts`):
 * konstruktor Entity pomija pole, którego nie ma czym wypełnić, a UPDATE budowany jest
 * z pól obecnych w obiekcie — puste pole nie znaczyło więc „skasuj", tylko „nie ruszaj".
 *
 * REGON i KRS nie mają klucza unikalnego (odczyt information_schema 2026-09-10), więc pusty
 * tekst nie zderzyłby się tam z niczym. Wartością „brak" jest i tak `null` (D-REG-2), bo
 * podmioty bez numeru mają dziś w tych kolumnach właśnie `null` — dwie postaci pustki
 * w jednej kolumnie psułyby każde późniejsze zliczanie.
 *
 * Bramki FIDmana te dwa numery nie dotyczą: do FIDmana z podmiotu idzie NIP, nie REGON
 * ani KRS (odczyt kodu 2026-09-10). Dlatego tu jej nie ma — pilnuje jej test clearNip.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../tools/ToolsDb');
jest.mock('../../contracts/fidmanSync/FidmanSync');

import ToolsDb from '../../tools/ToolsDb';
import * as FidmanSync from '../../contracts/fidmanSync/FidmanSync';
import EntitiesController from '../EntitiesController';

/** Rekord, jaki odda odczyt po zapisie — z REGON-em i KRS-em już wyczyszczonymi. */
const ROW_AFTER_CLEAR = {
    Id: 749,
    Name: 'Urząd Miejski w Ząbkowicach Śląskich',
    ShortName: 'UM Ząbkowice Śl',
    Address: 'ul. 1 Maja 15, 57-200 Ząbkowice Śląskie',
    TaxNumber: '8870011210',
    Regon: null,
    Krs: null,
    Www: null,
    Email: null,
    Phone: null,
    GusStatus: 'NOT_CHECKED',
    GusCheckedAt: null,
    GusSnapshot: null,
};

describe('EntitiesController.edit — czyszczenie REGON-u i KRS-u (REG-1, D-REG-1)', () => {
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

    it('KONTROLA NEGATYWNA: pusty REGON naprawdę trafia do zapisu jako wartość pusta', async () => {
        await EntitiesController.edit({
            id: 749,
            name: 'Urząd Miejski w Ząbkowicach Śląskich',
            taxNumber: '8870011210',
            regon: '',
        } as any);

        const saved = savedEntity();
        // Klucz MUSI istnieć w obiekcie — pole nieobecne to dla UPDATE-a „nie ruszaj".
        expect(Object.keys(saved)).toContain('regon');
        expect(saved.regon).toBeNull();
    });

    it('KONTROLA NEGATYWNA: pusty KRS naprawdę trafia do zapisu jako wartość pusta', async () => {
        await EntitiesController.edit({
            id: 749,
            name: 'Urząd Miejski w Ząbkowicach Śląskich',
            taxNumber: '8870011210',
            krs: '',
        } as any);

        const saved = savedEntity();
        expect(Object.keys(saved)).toContain('krs');
        expect(saved.krs).toBeNull();
    });

    it('oba numery skasowane naraz czyszczą się oba, a NIP zostaje', async () => {
        await EntitiesController.edit({
            id: 749,
            name: 'Urząd Miejski w Ząbkowicach Śląskich',
            taxNumber: '8870011210',
            regon: '   ',
            krs: '',
        } as any);

        const saved = savedEntity();
        expect(saved.regon).toBeNull();
        expect(saved.krs).toBeNull();
        expect(saved.taxNumber).toBe('8870011210');
    });

    it('skasowanie samego REGON-u nie rusza KRS-u', async () => {
        await EntitiesController.edit({
            id: 749,
            name: 'Urząd Miejski w Ząbkowicach Śląskich',
            taxNumber: '8870011210',
            regon: '',
            krs: '0000123456',
        } as any);

        const saved = savedEntity();
        expect(saved.regon).toBeNull();
        expect(saved.krs).toBe('0000123456');
    });

    it('REGON i KRS podane zwyczajnie dalej się zapisują', async () => {
        await EntitiesController.edit({
            id: 749,
            name: 'Urząd Miejski w Ząbkowicach Śląskich',
            regon: '000529820',
            krs: '0000123456',
        } as any);

        const saved = savedEntity();
        expect(saved.regon).toBe('000529820');
        expect(saved.krs).toBe('0000123456');
    });

    it('pola w ogóle niepodane dalej znaczą „nie ruszaj"', async () => {
        await EntitiesController.edit({
            id: 749,
            name: 'Urząd Miejski w Ząbkowicach Śląskich',
        } as any);

        const keys = Object.keys(savedEntity());
        expect(keys).not.toContain('regon');
        expect(keys).not.toContain('krs');
    });
});
