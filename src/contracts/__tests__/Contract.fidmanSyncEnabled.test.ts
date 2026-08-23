/**
 * WYK-1 — pułapka zapisu znacznika „Objęta synchronizacją" (Contracts.FidmanSyncEnabled,
 * migracja 012).
 * Plan: 20_projects/Aplikacje/PS.APP.01/plans/2026-08-23-wyk-wykluczenia-synchronizacji-plan.md
 *
 * Zapis umowy w PS jest PODMIANĄ CAŁEGO REKORDU. Jeżeli klient — formularz sprzed WYK-2 albo
 * skill agenta wpisujący dane z umowy — nie odeśle znacznika w ładunku zapisu, znacznik nie ma
 * prawa się po cichu wyzerować: umowa wypadłaby wtedy z synchronizacji bez śladu w logu.
 *
 * Dlatego ToolsDb NIE jest tu zmockowany, a asercje idą na TREŚĆ zapytania UPDATE, które
 * naprawdę poleciałoby do bazy (wzorzec z ../../tools/__tests__/ToolsDb.connections.test.ts:
 * prawdziwy ToolsDb + podstawione połączenie). Sprawdzanie samego `contract.fidmanSyncEnabled
 * === undefined` byłoby słabsze — mówiłoby o polu w obiekcie, a pytanie brzmi, czy kolumna
 * w bazie zostanie ruszona.
 *
 * Kontrola pozytywna jest tu obowiązkowa: gdyby kolumna nie trafiała do UPDATE NIGDY, test
 * negatywny też byłby zielony i nie dowodziłby niczego. Dlatego jawne `true` i jawne `false`
 * mają w zapytaniu wylądować.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ToolsDb celowo NIEZAMOCKOWANY — o to w tym pliku chodzi.
import ContractOur from '../ContractOur';
import ContractRepository from '../ContractRepository';

type Captured = { sql: string; values: any[] };

const makeFakeConn = (captured: Captured[]) =>
    ({
        threadId: 42,
        execute: jest.fn(async (sql: any, values: any) => {
            captured.push({ sql: String(sql), values: values as any[] });
            return [{ affectedRows: 1 }, undefined];
        }),
        query: jest.fn(async () => [[], undefined]),
        commit: jest.fn(async () => undefined),
        rollback: jest.fn(async () => undefined),
        release: jest.fn(),
    } as any);

const makeOurContract = (overrides: any = {}) =>
    new ContractOur({
        id: 4242,
        ourId: 'WAW.UR.001',
        _type: { id: 4, name: 'Czerwony', isOur: false },
        typeId: 4,
        number: '001',
        name: 'Testowy kontrakt na roboty',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        status: 'W trakcie',
        _project: { id: 1, ourId: 'PRJ-001', gdFolderId: 'gd-1' },
        projectOurId: 'PRJ-001',
        adminId: 10,
        managerId: 20,
        ...overrides,
    });

/** UPDATE wystawiony na tabelę Contracts (ContractOur zapisuje też OurContractsData). */
const contractsUpdate = (captured: Captured[]): Captured => {
    const row = captured.find((c) => c.sql.startsWith('UPDATE Contracts SET'));
    if (!row) throw new Error('Brak zapytania UPDATE na tabelę Contracts');
    return row;
};

/** Wartość przypisana kolumnie w prepared statement — po pozycji `?` w liście SET. */
const valueForColumn = (stmt: Captured, column: string): any => {
    const columns = [...stmt.sql.matchAll(/`([A-Za-z]+)`=\?/g)].map(
        (m) => m[1]
    );
    const index = columns.indexOf(column);
    if (index === -1) throw new Error(`Kolumny ${column} nie ma w UPDATE`);
    return stmt.values[index];
};

describe('WYK-1 — zapis umowy a znacznik „Objęta synchronizacją"', () => {
    let captured: Captured[];
    let repository: ContractRepository;

    beforeEach(() => {
        captured = [];
        repository = new ContractRepository();
    });

    it('zapis umowy BEZ znacznika w żądaniu nie umieszcza kolumny FidmanSyncEnabled w UPDATE (wartość w bazie zostaje nietknięta)', async () => {
        const contract = makeOurContract();
        // Warunek konieczny: konstruktor NIE zamienił braku pola na `false`.
        expect(contract.fidmanSyncEnabled).toBeUndefined();

        await repository.editInDb(contract as any, makeFakeConn(captured), true);

        expect(contractsUpdate(captured).sql).not.toContain('FidmanSyncEnabled');
    });

    it('KONTROLA POZYTYWNA: zapis umowy ZE znacznikiem włączonym umieszcza kolumnę w UPDATE z wartością true', async () => {
        const contract = makeOurContract({ fidmanSyncEnabled: true });
        expect(contract.fidmanSyncEnabled).toBe(true);

        await repository.editInDb(contract as any, makeFakeConn(captured), true);

        const stmt = contractsUpdate(captured);
        expect(stmt.sql).toContain('`FidmanSyncEnabled`=?');
        expect(valueForColumn(stmt, 'FidmanSyncEnabled')).toBe(true);
    });

    it('jawne wyłączenie znacznika trafia do UPDATE jako false — wykluczyć umowę nadal można', async () => {
        const contract = makeOurContract({ fidmanSyncEnabled: false });

        await repository.editInDb(contract as any, makeFakeConn(captured), true);

        const stmt = contractsUpdate(captured);
        expect(stmt.sql).toContain('`FidmanSyncEnabled`=?');
        expect(valueForColumn(stmt, 'FidmanSyncEnabled')).toBe(false);
    });

    it('dodanie umowy BEZ znacznika nie umieszcza kolumny w INSERT — o wartości rozstrzyga DEFAULT 0, czyli nowa umowa rodzi się wykluczona', async () => {
        const contract = makeOurContract({ id: undefined });

        await repository.addInDb(contract as any, makeFakeConn(captured), true);

        const insert = captured.find((c) =>
            c.sql.startsWith('INSERT INTO Contracts (')
        );
        expect(insert).toBeDefined();
        expect(insert!.sql).not.toContain('FidmanSyncEnabled');
    });
});
