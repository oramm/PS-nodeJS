/**
 * GUS-1 — dwie rzeczy przy zapisie podmiotu:
 *
 *  1. D-GUS-5: NIP zapisuje się zawsze jako 10 cyfr, niezależnie od tego, czy człowiek
 *     wpisał go z myślnikami czy bez. To jedyne, co sprawia, że klucz unikalny na
 *     TaxNumber cokolwiek znaczy — dziś 8 par podmiotów na produkcji dzieli ten sam NIP
 *     wyłącznie dlatego, że dla bazy „123-456-32-18" i „1234563218" to dwa różne teksty.
 *     Osobno: numer, którego nie da się odczytać jako polskiego NIP-u (zagraniczny, pusty),
 *     ma zostać nietknięty — normalizacja nie ma prawa kasować danych.
 *
 *  2. D-GUS-2: REGON i KRS, które „Pobierz z GUS" wypełnia w formularzu, dojeżdżają do
 *     zapisu i są na liście pól aktualizowanych przy edycji.
 *
 * Bez bazy, ten sam styl mockowania co EntitiesController.fidmanSync.nip.test.ts.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../tools/ToolsDb');
jest.mock('../../contracts/fidmanSync/FidmanSync');

import ToolsDb from '../../tools/ToolsDb';
import * as FidmanSync from '../../contracts/fidmanSync/FidmanSync';
import EntitiesController from '../EntitiesController';

describe('EntitiesController — NIP, REGON i KRS przy zapisie (GUS-1)', () => {
    let mockConn: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockConn = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
        };

        (ToolsDb.transaction as jest.Mock).mockImplementation(async (cb: any) => {
            await mockConn.beginTransaction();
            try {
                const result = await cb(mockConn);
                await mockConn.commit();
                return result;
            } catch (e) {
                await mockConn.rollback();
                throw e;
            }
        });
        (ToolsDb.addInDb as any).mockResolvedValue(undefined);
        (ToolsDb.editInDb as any).mockResolvedValue(undefined);
        (FidmanSync.entityHasSyncedContract as any).mockResolvedValue(false);
    });

    /** Wiersz, który ToolsDb dostał do zapisania. */
    function writtenEntity(mockFn: any) {
        return mockFn.mock.calls[0][1];
    }

    it('NIP z myślnikami i bez zapisują się identycznie (dodawanie)', async () => {
        await EntitiesController.add({
            name: 'Podmiot z myślnikami',
            taxNumber: '123-456-32-18',
        });
        const withDashes = writtenEntity(ToolsDb.addInDb);

        jest.clearAllMocks();
        (ToolsDb.addInDb as any).mockResolvedValue(undefined);

        await EntitiesController.add({
            name: 'Podmiot bez myślników',
            taxNumber: '1234563218',
        });
        const withoutDashes = writtenEntity(ToolsDb.addInDb);

        expect(withDashes.taxNumber).toBe('1234563218');
        expect(withoutDashes.taxNumber).toBe('1234563218');
        expect(withDashes.taxNumber).toBe(withoutDashes.taxNumber);
    });

    it('NIP z myślnikami i bez zapisują się identycznie (edycja)', async () => {
        await EntitiesController.edit({
            id: 7,
            name: 'Podmiot',
            taxNumber: '123-456-32-18',
        });
        expect(writtenEntity(ToolsDb.editInDb).taxNumber).toBe('1234563218');
    });

    it('NIP z odstępami i innym zapisem też schodzi do 10 cyfr', async () => {
        await EntitiesController.add({
            name: 'Podmiot ze spacjami',
            taxNumber: ' 123 456 32 18 ',
        });
        expect(writtenEntity(ToolsDb.addInDb).taxNumber).toBe('1234563218');
    });

    it('numer zagraniczny zostaje nietknięty — normalizacja nie kasuje danych', async () => {
        await EntitiesController.add({
            name: 'Foreign Co',
            taxNumber: 'FR-123-XYZ',
        });
        expect(writtenEntity(ToolsDb.addInDb).taxNumber).toBe('FR-123-XYZ');
    });

    it('podmiot bez NIP-u zapisuje się dalej, a puste zostaje puste', async () => {
        await EntitiesController.add({ name: 'Podmiot bez NIP-u' });
        expect(writtenEntity(ToolsDb.addInDb).taxNumber).toBeUndefined();
    });

    it('REGON i KRS z lookupu GUS dojeżdżają do zapisu (dodawanie)', async () => {
        await EntitiesController.add({
            name: 'T-MOBILE POLSKA SPÓŁKA AKCYJNA',
            address: 'ul. Marynarska 12, 02-674 Warszawa',
            taxNumber: '526-10-40-567',
            regon: '011417295',
            krs: '0000391193',
        });

        const saved = writtenEntity(ToolsDb.addInDb);
        expect(saved.regon).toBe('011417295');
        expect(saved.krs).toBe('0000391193');
        expect(saved.taxNumber).toBe('5261040567');
    });

    it('REGON i KRS przeżywają edycję i są na liście pól do aktualizacji', async () => {
        await EntitiesController.edit({
            id: 7,
            name: 'T-MOBILE POLSKA SPÓŁKA AKCYJNA',
            regon: '011417295',
            krs: '0000391193',
        });

        const saved = writtenEntity(ToolsDb.editInDb);
        expect(saved.regon).toBe('011417295');
        expect(saved.krs).toBe('0000391193');

        const fieldsToUpdate = (ToolsDb.editInDb as any).mock.calls[0][4];
        expect(fieldsToUpdate).toEqual(expect.arrayContaining(['regon', 'krs']));
    });
});
