/**
 * GUS-2 — sprawdzenie podmiotu w GUS i przyjęcie danych z migawki. Bez bazy i bez sieci:
 * odczyt podmiotu i zapis idą przez zamockowany ToolsDb, GUS przez zamockowany serwis.
 *
 * Sercem tego pliku jest D-GUS-1: „check" wolno zapisać wyłącznie wynik porównania.
 * Test „check nie zmienia Name ani Address" czyta instrukcję UPDATE, która naprawdę
 * poszłaby do bazy, i pilnuje, żeby nie było w niej kolumn z danymi podmiotu. Bez
 * zabezpieczenia w EntityRepository.updateGusResult ten test jest czerwony.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../tools/ToolsDb');
// GUS-4a: przyjęcie danych chodzi teraz w transakcji i zagląda do kolejki FIDmana.
// Tu sprawdzamy sam zapis, więc synchronizacja jest zamockowana na głucho; ma własny
// plik testów (EntitiesController.gusAcceptFidman.test.ts).
jest.mock('../../contracts/fidmanSync/FidmanSync');
jest.mock('../gusBir/GusBirService', () => {
    const actual = jest.requireActual('../gusBir/GusBirService') as any;
    return {
        __esModule: true,
        default: {
            isConfigured: jest.fn(() => true),
            lookupByNip: jest.fn(),
        },
        GusBirNotConfiguredError: actual.GusBirNotConfiguredError,
        GusBirNotFoundError: actual.GusBirNotFoundError,
        GusBirEmptyRecordError: actual.GusBirEmptyRecordError,
    };
});

import ToolsDb from '../../tools/ToolsDb';
import GusBirService, {
    GusBirEmptyRecordError,
    GusBirNotFoundError,
} from '../gusBir/GusBirService';
import EntitiesController from '../EntitiesController';

const ENVI_ROW = {
    Id: 1,
    Name: 'ENVI',
    ShortName: 'ENVI',
    Address: 'ul. Jana Brzechwy 3, 49-305 Brzeg',
    TaxNumber: '747-191-75-75',
    Regon: null,
    Krs: null,
    Www: null,
    Email: null,
    Phone: null,
    GusStatus: 'NOT_CHECKED',
    GusCheckedAt: null,
    GusSnapshot: null,
};

/** Wszystkie instrukcje SQL, które poszłyby do bazy. */
function executedSql(): string[] {
    return (ToolsDb.executeSQL as jest.Mock).mock.calls.map((c: any) =>
        String(c[0])
    );
}

function mockEntityRow(row: Record<string, unknown>) {
    (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([row]);
}

describe('EntitiesController.gusCheck — zapisuje werdykt, nie dane podmiotu (GUS-2, D-GUS-1)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (GusBirService.isConfigured as jest.Mock).mockReturnValue(true);
        (ToolsDb.executeSQL as any).mockResolvedValue({});
        (ToolsDb.transaction as jest.Mock).mockImplementation(
            async (cb: any) => cb({} as any)
        );
        mockEntityRow(ENVI_ROW);
    });

    it('KONTROLA NEGATYWNA: check nie zmienia Name ani Address', async () => {
        (GusBirService.lookupByNip as any).mockResolvedValue({
            name: 'ZUPEŁNIE INNA NAZWA SPÓŁKA AKCYJNA',
            address: 'ul. Inna 99, 00-999 Gdzieś',
            regon: '531090218',
            krs: '0000123456',
        });

        const result = await EntitiesController.gusCheck(1);

        expect(result.ok).toBe(true);
        const sqls = executedSql();
        expect(sqls).toHaveLength(1);
        // Instrukcja zapisu nie ma prawa dotykać kolumn z danymi podmiotu.
        expect(sqls[0]).not.toMatch(/\bName\b/);
        expect(sqls[0]).not.toMatch(/\bAddress\b/);
        expect(sqls[0]).not.toMatch(/\bTaxNumber\b/);
        expect(sqls[0]).not.toMatch(/\bRegon\b/);
        expect(sqls[0]).not.toMatch(/\bKrs\b/);
        // ...a wartości z GUS nie mają prawa pojawić się nigdzie poza migawką.
        expect(sqls[0]).toMatch(/GusStatus/);
        expect(sqls[0]).toMatch(/GusSnapshot/);
        expect(sqls[0]).toMatch(/^UPDATE Entities SET GusStatus = /);
    });

    it('różnica w nazwie i adresie daje DIFF', async () => {
        (GusBirService.lookupByNip as any).mockResolvedValue({
            name: 'ZUPEŁNIE INNA NAZWA',
            address: 'ul. Inna 99, 00-999 Gdzieś',
        });

        const result = await EntitiesController.gusCheck(1);

        expect(result).toMatchObject({ ok: true, status: 'DIFF' });
        if (!result.ok) throw new Error('spodziewano się wyniku');
        expect(result.differences.map((d) => d.field).sort()).toEqual([
            'address',
            'name',
        ]);
    });

    it('sam inny zapis formy prawnej daje OK', async () => {
        mockEntityRow({
            ...ENVI_ROW,
            Name: 'Test-Bud Sp. z o.o.',
            Address: 'Al. Pałacowa 1, 55-040 Kobierzyce',
        });
        (GusBirService.lookupByNip as any).mockResolvedValue({
            name: 'TEST-BUD SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
            address: 'Aleja Pałacowa 1, 55-040 Kobierzyce',
        });

        const result = await EntitiesController.gusCheck(1);
        expect(result).toMatchObject({ ok: true, status: 'OK' });
    });

    it('data zakończenia działalności daje CLOSED', async () => {
        (GusBirService.lookupByNip as any).mockResolvedValue({
            name: 'ENVI',
            address: 'ul. Jana Brzechwy 3, 49-305 Brzeg',
            closedAt: '2024-03-31',
        });

        const result = await EntitiesController.gusCheck(1);
        expect(result).toMatchObject({ ok: true, status: 'CLOSED' });
    });

    it('NIP zapisany z myślnikami jest normalizowany przed zapytaniem do GUS', async () => {
        (GusBirService.lookupByNip as any).mockResolvedValue({
            name: 'ENVI',
            address: 'ul. Jana Brzechwy 3, 49-305 Brzeg',
        });

        await EntitiesController.gusCheck(1);
        expect(GusBirService.lookupByNip).toHaveBeenCalledWith('7471917575');
    });

    it('podmiot nieznany w rejestrze -> NOT_FOUND, migawka wyczyszczona', async () => {
        (GusBirService.lookupByNip as any).mockRejectedValue(
            new GusBirNotFoundError('7471917575')
        );

        const result = await EntitiesController.gusCheck(1);

        expect(result).toMatchObject({ ok: true, status: 'NOT_FOUND' });
        expect(executedSql()[0]).toMatch(/GusSnapshot/);
    });

    it('awaria GUS -> ERROR, reszta rekordu nietknięta (fail-open)', async () => {
        (GusBirService.lookupByNip as any).mockRejectedValue(
            new Error('ECONNRESET')
        );

        const result = await EntitiesController.gusCheck(1);

        expect(result).toMatchObject({ ok: true, status: 'ERROR' });
        const sql = executedSql()[0];
        expect(sql).toMatch(/GusStatus/);
        // Migawka celowo POZA instrukcją: to, co GUS mówił poprzednio, zostaje.
        expect(sql).not.toMatch(/GusSnapshot/);
        expect(sql).not.toMatch(/\bName\b/);
        expect(sql).not.toMatch(/\bAddress\b/);
    });

    /**
     * GPO-1 / D-GPO-2 — sedno defektu z produkcji: rekord 776 (MPWiK Warszawa) dostal
     * stan „zgodny" z migawka {"name":"","address":""}, bo porownanie nie widzi roznicy
     * tam, gdzie rejestr nic nie podal. Odpowiedz nie do odczytania ma sie konczyc tak
     * samo jak awaria sieci: sam stan „blad", migawka nietknieta.
     */
    it('KONTROLA NEGATYWNA: odpowiedz rejestru bez nazwy -> ERROR, nie OK, migawka nietknieta', async () => {
        mockEntityRow({
            ...ENVI_ROW,
            GusStatus: 'DIFF',
            GusSnapshot: '{"name":"POPRZEDNIA NAZWA","address":"ul. Poprzednia 1"}',
        });
        (GusBirService.lookupByNip as any).mockRejectedValue(
            new GusBirEmptyRecordError('7471917575')
        );

        const result = await EntitiesController.gusCheck(1);

        expect(result).toMatchObject({ ok: true, status: 'ERROR' });
        // To, co rejestr mowil poprzednio, wraca nietkniete.
        expect((result as any).snapshot).toEqual({
            name: 'POPRZEDNIA NAZWA',
            address: 'ul. Poprzednia 1',
        });
        const sql = executedSql()[0];
        expect(sql).toMatch(/GusStatus/);
        expect(sql).not.toMatch(/GusSnapshot/);
    });

    it('podmiot bez NIP-u: sensowna odmowa, bez pytania GUS-u i bez zapisu', async () => {
        mockEntityRow({ ...ENVI_ROW, TaxNumber: null });

        const result = await EntitiesController.gusCheck(1);

        expect(result).toMatchObject({ ok: false, reason: 'NO_USABLE_NIP' });
        expect(GusBirService.lookupByNip).not.toHaveBeenCalled();
        expect(executedSql()).toHaveLength(0);
    });

    it('numer, którego nie da się odczytać jako polskiego NIP-u: to samo, bez zapisu', async () => {
        mockEntityRow({ ...ENVI_ROW, TaxNumber: 'FR-123-XYZ' });

        const result = await EntitiesController.gusCheck(1);

        expect(result).toMatchObject({ ok: false, reason: 'NO_USABLE_NIP' });
        if (result.ok) throw new Error('spodziewano się odmowy');
        expect(result.message).toContain('FR-123-XYZ');
        expect(GusBirService.lookupByNip).not.toHaveBeenCalled();
        expect(executedSql()).toHaveLength(0);
    });

    it('brak klucza GUS: odmowa, bez zapisu ERROR na całym słowniku', async () => {
        (GusBirService.isConfigured as jest.Mock).mockReturnValue(false);

        const result = await EntitiesController.gusCheck(1);

        expect(result).toMatchObject({ ok: false, reason: 'GUS_NOT_CONFIGURED' });
        expect(executedSql()).toHaveLength(0);
    });

    it('nieznany podmiot -> odmowa ENTITY_NOT_FOUND', async () => {
        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([]);

        const result = await EntitiesController.gusCheck(999);
        expect(result).toMatchObject({ ok: false, reason: 'ENTITY_NOT_FOUND' });
    });
});

describe('EntitiesController.gusAccept — przepisuje tylko wskazane pola (GUS-2, D-GUS-1)', () => {
    const SNAPSHOT = {
        name: 'ENVI KONSULTING SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ',
        address: 'ul. Nowa 7, 49-300 Brzeg',
        regon: '531090218',
        krs: '0000123456',
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (ToolsDb.executeSQL as any).mockResolvedValue({});
        mockEntityRow({
            ...ENVI_ROW,
            GusStatus: 'DIFF',
            GusCheckedAt: new Date('2026-09-09T10:00:00Z'),
            GusSnapshot: JSON.stringify(SNAPSHOT),
        });
    });

    it('przyjęcie samej nazwy nie tyka adresu', async () => {
        const result = await EntitiesController.gusAccept(1, ['name']);

        expect(result).toMatchObject({ ok: true, applied: ['name'] });
        const sql = executedSql()[0];
        expect(sql).toMatch(/`?Name`? = /);
        expect(sql).not.toMatch(/\bAddress\b/);
        expect(sql).not.toMatch(/\bRegon\b/);
        expect(sql).not.toMatch(/\bKrs\b/);
        expect(sql).toContain('ENVI KONSULTING');
    });

    it('po przyjęciu samej nazwy status dalej mówi o różnicy w adresie', async () => {
        const result = await EntitiesController.gusAccept(1, ['name']);
        expect(result).toMatchObject({ ok: true, status: 'DIFF' });
        if (!result.ok) throw new Error('spodziewano się wyniku');
        expect(result.differences.map((d) => d.field)).toEqual(['address']);
    });

    it('przyjęcie wszystkiego daje OK', async () => {
        const result = await EntitiesController.gusAccept(1, [
            'name',
            'address',
            'regon',
            'krs',
        ]);
        expect(result).toMatchObject({ ok: true, status: 'OK' });
        if (!result.ok) throw new Error('spodziewano się wyniku');
        expect(result.applied.sort()).toEqual(['address', 'krs', 'name', 'regon']);
    });

    it('pole, którego GUS nie podał, nie jest przyjmowane — pustka nie kasuje danych', async () => {
        mockEntityRow({
            ...ENVI_ROW,
            GusStatus: 'DIFF',
            GusSnapshot: JSON.stringify({ name: 'INNA NAZWA' }),
        });

        const result = await EntitiesController.gusAccept(1, ['name', 'address']);

        expect(result).toMatchObject({ ok: true, applied: ['name'] });
        expect(executedSql()[0]).not.toMatch(/\bAddress\b/);
    });

    it('podmiot bez zapisanej migawki -> odmowa, bez zapisu', async () => {
        mockEntityRow(ENVI_ROW);

        const result = await EntitiesController.gusAccept(1, ['name']);

        expect(result).toMatchObject({ ok: false, reason: 'NO_SNAPSHOT' });
        expect(executedSql()).toHaveLength(0);
    });

    it('zakończona działalność zostaje CLOSED także po przyjęciu danych', async () => {
        mockEntityRow({
            ...ENVI_ROW,
            GusStatus: 'CLOSED',
            GusSnapshot: JSON.stringify({ ...SNAPSHOT, closedAt: '2024-03-31' }),
        });

        const result = await EntitiesController.gusAccept(1, [
            'name',
            'address',
            'regon',
            'krs',
        ]);
        expect(result).toMatchObject({ ok: true, status: 'CLOSED' });
    });
});
