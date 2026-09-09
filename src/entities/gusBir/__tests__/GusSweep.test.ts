/**
 * GUS-3 — przebieg całego słownika partiami. Bez bazy i bez sieci: zapytania i zapisy idą
 * przez zamockowany ToolsDb, rejestr GUS przez zamockowany serwis.
 *
 * Trzy rzeczy, których ten plik pilnuje, bo bez nich przebieg jest nieużywalny:
 *
 * 1. ZBIEŻNOŚĆ — dwa wywołania tego samego dnia nie sprawdzają podmiotu dwa razy.
 *    Odpowiada za to warunek „niesprawdzone dzisiaj", który MUSI stać w obu zapytaniach:
 *    w wyborze partii i w liczniku `remaining`. Gdyby stał tylko w jednym, pętla wołającego
 *    albo nigdy by się nie zatrzymała, albo zatrzymałaby się z niesprawdzonymi podmiotami.
 *    Te testy czytają SQL, który naprawdę poszedłby do bazy — usunięcie warunku z kodu
 *    robi je czerwonymi.
 * 2. ODPORNOŚĆ — awaria GUS-u na jednym podmiocie nie przerywa partii.
 * 3. PUŁAPKA P-5 — jedna sesja `bir1` na partię, nie jedna na podmiot.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../tools/ToolsDb');
jest.mock('../GusBirService', () => {
    const actual = jest.requireActual('../GusBirService') as any;
    return {
        __esModule: true,
        default: {
            isConfigured: jest.fn(() => true),
            openSession: jest.fn(() => ({ sesja: 'jedna' })),
            lookupByNip: jest.fn(),
        },
        GusBirNotConfiguredError: actual.GusBirNotConfiguredError,
        GusBirNotFoundError: actual.GusBirNotFoundError,
    };
});

import ToolsDb from '../../../tools/ToolsDb';
import GusBirService, { GusBirNotFoundError } from '../GusBirService';
import { runGusSweep, runGusSweepUntilDone } from '../GusSweep';

/** Podmiot z prawidłowym NIP-em (suma kontrolna się zgadza) — ENVI. */
const ENVI = {
    Id: 1,
    Name: 'ENVI',
    Address: 'ul. Jana Brzechwy 3, 49-305 Brzeg',
    TaxNumber: '747-191-75-75',
    Regon: null,
    Krs: null,
};

function entityRow(id: number, taxNumber: string, name = `Podmiot ${id}`) {
    return { Id: id, Name: name, Address: 'ul. Testowa 1, 00-001 Warszawa', TaxNumber: taxNumber, Regon: null, Krs: null };
}

/** NIP-y o poprawnej sumie kontrolnej, wzięte z kopii lokalnej. */
const NIP_A = '6750000065';
const NIP_B = '8961308068';
const NIP_C = '9442253228';

/** Wszystkie zapytania SELECT, które poszłyby do bazy. */
function selects(): string[] {
    return (ToolsDb.getQueryCallbackAsync as jest.Mock).mock.calls.map((c: any) =>
        String(c[0])
    );
}

/** Wszystkie instrukcje UPDATE, które poszłyby do bazy. */
function updates(): string[] {
    return (ToolsDb.executeSQL as jest.Mock).mock.calls.map((c: any) => String(c[0]));
}

/**
 * Ustawia odpowiedzi bazy: kolejne partie, a między nimi licznik `remaining`.
 * Kolejność wywołań w runGusSweep to: SELECT partii, potem SELECT COUNT na końcu.
 */
function mockDb(batches: any[][], remainingAfter: number[]) {
    const answers: any[] = [];
    batches.forEach((batch, index) => {
        answers.push(batch);
        answers.push([{ Ile: remainingAfter[index] ?? 0 }]);
    });
    const mock = ToolsDb.getQueryCallbackAsync as any;
    answers.forEach((answer) => mock.mockResolvedValueOnce(answer));
    mock.mockResolvedValue([{ Ile: 0 }]);
}

const ODPOWIEDZ_GUS = {
    name: 'ENVI',
    address: 'ul. Jana Brzechwy 3, 49-305 Brzeg',
    regon: '160012345',
    krs: undefined,
    closedAt: undefined,
};

beforeEach(() => {
    // mockReset, nie mockClear: kolejka mockResolvedValueOnce z poprzedniego testu
    // przeżyłaby samo wyczyszczenie wywołań i zatruła następny test.
    (ToolsDb.getQueryCallbackAsync as any).mockReset();
    (ToolsDb.executeSQL as any).mockReset();
    (GusBirService.lookupByNip as any).mockReset();
    (GusBirService.isConfigured as any).mockReset();
    (GusBirService.openSession as any).mockReset();

    (GusBirService.isConfigured as jest.Mock).mockReturnValue(true);
    (GusBirService.openSession as jest.Mock).mockReturnValue({ sesja: 'jedna' });
    (ToolsDb.executeSQL as any).mockResolvedValue(undefined);
});

describe('GusSweep — kolejka zbiega do zera (kryterium 1)', () => {
    it('wybór partii pyta wyłącznie o podmioty niesprawdzone dzisiaj', async () => {
        mockDb([[]], [0]);
        await runGusSweep();
        const zapytanieOPartie = selects()[0];
        expect(zapytanieOPartie).toContain('GusCheckedAt IS NULL');
        expect(zapytanieOPartie).toContain('GusCheckedAt < CURDATE()');
    });

    it('licznik pozostałych używa TEGO SAMEGO warunku co wybór partii', async () => {
        mockDb([[]], [0]);
        await runGusSweep();
        const [zapytanieOPartie, zapytanieOLicznik] = selects();
        // Warunek kolejki musi być identyczny w obu zapytaniach — inaczej pętla
        // wołającego albo się nie zatrzyma, albo zatrzyma się za wcześnie.
        const warunek = /WHERE([\s\S]*?)(ORDER BY|$)/.exec(zapytanieOPartie)?.[1];
        expect(warunek).toBeDefined();
        expect(zapytanieOLicznik).toContain(warunek!.trim());
    });

    it('najdawniej sprawdzone idą pierwsze, nigdy niesprawdzone przodem', async () => {
        mockDb([[]], [0]);
        await runGusSweep();
        expect(selects()[0]).toContain('GusCheckedAt IS NULL DESC');
        expect(selects()[0]).toContain('GusCheckedAt ASC');
    });

    it('każdy podmiot wzięty do partii dostaje datę sprawdzenia', async () => {
        // Bez tego rekord wróciłby do kolejki w następnym wywołaniu tego samego dnia.
        mockDb([[ENVI, entityRow(2, NIP_A), entityRow(3, 'abc')]], [0]);
        (GusBirService.lookupByNip as any).mockResolvedValue(ODPOWIEDZ_GUS);

        await runGusSweep();

        const zapisy = updates();
        expect(zapisy).toHaveLength(3);
        for (const zapis of zapisy) expect(zapis).toContain('GusCheckedAt =');
    });
});

describe('GusSweep — partia idzie dalej mimo awarii (kryterium 2)', () => {
    it('awaria GUS na drugim z trzech podmiotów nie przerywa partii', async () => {
        mockDb([[ENVI, entityRow(2, NIP_A), entityRow(3, NIP_B)]], [0]);
        (GusBirService.lookupByNip as any)
            .mockResolvedValueOnce(ODPOWIEDZ_GUS)
            .mockRejectedValueOnce(new Error('GUS: przerwa w usłudze'))
            .mockResolvedValueOnce(ODPOWIEDZ_GUS);

        const wynik = await runGusSweep();

        expect(GusBirService.lookupByNip).toHaveBeenCalledTimes(3);
        expect(wynik.checked).toBe(3);
        expect(wynik.byStatus.ERROR).toBe(1);
        expect(wynik.aborted).toBe(false);
        // Rekord, który padł, dostaje ERROR i nie traci migawki (nie ma jej w UPDATE).
        const zapisBledny = updates().find((sql) => sql.includes("'ERROR'"))!;
        expect(zapisBledny).toContain('WHERE Id = 2');
        expect(zapisBledny).not.toContain('GusSnapshot');
    });

    it('nieznany NIP kończy się NOT_FOUND i czyści migawkę', async () => {
        mockDb([[ENVI]], [0]);
        (GusBirService.lookupByNip as any).mockRejectedValue(
            new GusBirNotFoundError('7471917575')
        );

        const wynik = await runGusSweep();

        expect(wynik.byStatus.NOT_FOUND).toBe(1);
        expect(updates()[0]).toContain('GusSnapshot = NULL');
    });

    it('NIP z błędną sumą kontrolną dostaje ERROR i nie pyta GUS-u', async () => {
        mockDb([[entityRow(7, '7070016738', 'Gmina Kowary')]], [0]);

        const wynik = await runGusSweep();

        expect(GusBirService.lookupByNip).not.toHaveBeenCalled();
        expect(wynik.byStatus.ERROR).toBe(1);
        expect(updates()[0]).toContain("GusStatus = 'ERROR'");
    });

    it('sprawdzenie nigdy nie zapisuje nazwy ani adresu podmiotu (D-GUS-1)', async () => {
        mockDb([[ENVI]], [0]);
        (GusBirService.lookupByNip as any).mockResolvedValue({
            ...ODPOWIEDZ_GUS,
            name: 'ENVI SPÓŁKA CYWILNA MAREK GAZDA',
            address: 'INNA 9, 00-002 GDAŃSK',
        });

        await runGusSweep();

        const zapis = updates()[0];
        expect(zapis).toContain("GusStatus = 'DIFF'");
        expect(zapis).not.toMatch(/\bName\s*=/);
        expect(zapis).not.toMatch(/\bAddress\s*=/);
    });
});

describe('GusSweep — jedna sesja GUS na partię (pułapka P-5)', () => {
    it('sesja powstaje raz, choć podmiotów jest trzy', async () => {
        mockDb([[ENVI, entityRow(2, NIP_A), entityRow(3, NIP_B)]], [0]);
        (GusBirService.lookupByNip as any).mockResolvedValue(ODPOWIEDZ_GUS);

        await runGusSweep();

        expect(GusBirService.openSession).toHaveBeenCalledTimes(1);
        for (const wywolanie of (GusBirService.lookupByNip as jest.Mock).mock.calls)
            expect((wywolanie as any[])[1]).toEqual({ sesja: 'jedna' });
    });
});

describe('GusSweep — brak klucza GUS nie stempluje słownika', () => {
    it('bez GUS_BIR_KEY przebieg kończy się bez ani jednego zapisu', async () => {
        (GusBirService.isConfigured as jest.Mock).mockReturnValue(false);
        mockDb([], []);
        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([{ Ile: 385 }]);

        const wynik = await runGusSweep();

        expect(wynik.aborted).toBe(true);
        expect(wynik.checked).toBe(0);
        expect(wynik.remaining).toBe(385);
        expect(updates()).toHaveLength(0);
        expect(GusBirService.openSession).not.toHaveBeenCalled();
    });
});

describe('GusSweep — pętla aż do końca (cron)', () => {
    it('woła partie do wyczerpania kolejki i sumuje liczniki', async () => {
        mockDb(
            [
                [ENVI, entityRow(2, NIP_A)],
                [entityRow(3, NIP_B), entityRow(4, NIP_C)],
                [],
            ],
            [2, 0, 0]
        );
        (GusBirService.lookupByNip as any).mockResolvedValue(ODPOWIEDZ_GUS);

        const wynik = await runGusSweepUntilDone(2);

        expect(wynik.remaining).toBe(0);
        expect(wynik.checked).toBe(4);
        expect(wynik.passes).toBe(2);
        expect(wynik.aborted).toBe(false);
    });

    it('partia, która nic nie ruszyła, kończy pętlę mimo niezerowej kolejki', async () => {
        // Zabezpieczenie przed kręceniem się w kółko na rekordzie, którego nie da się odhaczyć.
        mockDb([[]], [7]);
        const wynik = await runGusSweepUntilDone();
        expect(wynik.passes).toBe(1);
        expect(wynik.remaining).toBe(7);
    });
});
