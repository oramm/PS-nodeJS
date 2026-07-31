/**
 * RZL-1 — PS ENVI "metoda rozliczenia jako osobna oś danych", checkpoint RZL-1.
 * Plan: 20_projects/Aplikacje/PS.APP.01/plans/2026-07-29-rzl-metoda-rozliczenia-plan.md
 *
 * Coverage: read/write/brak-wartości dla nowej kolumny Contracts.SettlementMethod (migracja 008).
 *
 *  (a) find()/mapRowToModel: obie wartości domenowe przechodzą 1:1, a NULL zostaje `null`
 *      — mapper nie wymyśla wartości domyślnej dla kontraktu bez wpisanej metody.
 *  (b) addInDb: wartość trafia do zapisu tabeli Contracts.
 *  (c) addInDb bez pola: zostaje `undefined`, czyli ToolsDb pomija kolumnę — edycja, która
 *      nie niesie metody rozliczenia, nie kasuje wpisanej wcześniej wartości.
 *  (d) konstruktor odrzuca wartość spoza dziedziny. To NIE jest test dla samego testu:
 *      produkcja (MariaDB) ma pusty `sql_mode`, więc zła wartość ENUM nie wywala zapytania,
 *      tylko wchodzi do bazy jako pusty string. Baza tego nie złapie — musi złapać wejście.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../tools/ToolsDb');

import ToolsDb from '../../tools/ToolsDb';
import ContractOur from '../ContractOur';
import ContractRepository from '../ContractRepository';
import ContractEntityAssociationsHelper from '../ContractEntityAssociationsHelper';

describe('ContractRepository — SettlementMethod (RZL-1)', () => {
    let savedContractsData: any = null;

    beforeEach(() => {
        jest.clearAllMocks();
        savedContractsData = null;

        (ToolsDb.sqlToString as any).mockImplementation((s: string) => s ?? '');
        (ToolsDb.addInDb as any).mockImplementation(
            async (tableName: string, data: any) => {
                if (tableName === 'Contracts') {
                    savedContractsData = { ...data };
                    data.id = 4242;
                }
                return data;
            }
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

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

    const baseRow = {
        Id: 55,
        Alias: 'ROB-TEST',
        Number: '001',
        Name: 'Umowa na roboty testowa',
        OurIdRelated: null,
        StartDate: '2026-01-01',
        EndDate: '2026-12-31',
        GuaranteeEndDate: null,
        Value: null,
        Comment: '',
        Status: 'W trakcie',
        GdFolderId: null,
        MeetingProtocolsGdFolderId: null,
        MaterialCardsGdFolderId: null,
        LastUpdated: '2026-07-31 10:00:00',
        OurId: 'WAW.UR.001',
        ManagerId: null,
        AdminId: null,
        CityId: null,
        CityName: null,
        CityCode: null,
        ProjectId: 1,
        ProjectOurId: 'PRJ-001',
        ProjectName: 'Projekt testowy',
        ProjectAlias: 'Alias',
        ProjectGdFolderId: null,
        RemainingNotScheduledValue: null,
        RemainingNotIssuedValue: null,
        AdminName: null,
        AdminSurname: null,
        AdminEmail: null,
        ManagerName: null,
        ManagerSurname: null,
        ManagerEmail: null,
        RelatedId: null,
        RelatedName: null,
        RelatedGdFolderId: null,
        RelatedOurId: null,
        RelatedManagerId: null,
        RelatedManagerName: null,
        RelatedManagerSurname: null,
        RelatedManagerEmail: null,
        RelatedAdminId: null,
        RelatedAdminName: null,
        RelatedAdminSurname: null,
        RelatedAdminEmail: null,
        MainContractTypeId: 4,
        TypeName: 'Czerwony',
        TypeIsOur: 0,
        TypeDescription: 'Kontrakt na roboty w trybie buduj',
        ContractRangesNames: null,
    };

    const findWithSettlementMethod = async (value: unknown) => {
        const repository = new ContractRepository();
        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([]);
        jest.spyOn(repository as any, 'executeQuery').mockResolvedValue([
            { ...baseRow, SettlementMethod: value },
        ]);
        jest.spyOn(
            ContractEntityAssociationsHelper,
            'getContractEntityAssociationsList'
        ).mockResolvedValue([]);

        const [result] = (await repository.find([{ id: 55 }])) as ContractOur[];
        return result;
    };

    describe('find() / mapRowToModel', () => {
        it('przenosi LUMP_SUM z wiersza na model', async () => {
            const result = await findWithSettlementMethod('LUMP_SUM');
            expect(result.settlementMethod).toBe('LUMP_SUM');
        });

        it('przenosi MEASUREMENT z wiersza na model', async () => {
            const result = await findWithSettlementMethod('MEASUREMENT');
            expect(result.settlementMethod).toBe('MEASUREMENT');
        });

        it('zostawia null, gdy metoda nie jest wpisana — bez wartości domyślnej', async () => {
            const result = await findWithSettlementMethod(null);
            expect(result.settlementMethod).toBeNull();
        });

        it('pusty string z bazy czyta jako brak wartości', async () => {
            // Zmierzone na lokalnym mysqld ustawionym jak produkcja (sql_mode pusty):
            // INSERT ze złą wartością ENUM nie pada, tylko zapisuje '' — wartość, której
            // ani `IS NULL` nie złapie, ani front nie zrozumie.
            const result = await findWithSettlementMethod('');
            expect(result.settlementMethod).toBeNull();
        });
    });

    describe('addInDb', () => {
        it('zapisuje wpisaną metodę rozliczenia', async () => {
            const repository = new ContractRepository();
            const contract = makeOurContract({ settlementMethod: 'LUMP_SUM' });

            await repository.addInDb(contract as any);

            expect(savedContractsData).not.toBeNull();
            expect(savedContractsData.settlementMethod).toBe('LUMP_SUM');
        });

        it('bez pola zostawia undefined, żeby ToolsDb pominął kolumnę', async () => {
            const repository = new ContractRepository();
            const contract = makeOurContract();
            expect(contract.settlementMethod).toBeUndefined();

            await repository.addInDb(contract as any);

            expect(savedContractsData).not.toBeNull();
            expect(savedContractsData.settlementMethod).toBeUndefined();
        });
    });

    describe('walidacja wejścia', () => {
        it('odrzuca wartość spoza dziedziny (pusty sql_mode na produkcji nie odrzuci jej za nas)', () => {
            expect(() =>
                makeOurContract({ settlementMethod: 'RYCZALT' })
            ).toThrow(/Nieznana metoda rozliczenia/);
        });

        it('pusty string traktuje jak brak wartości, nie jak wartość ENUM', () => {
            const contract = makeOurContract({ settlementMethod: '' });
            expect(contract.settlementMethod).toBeNull();
        });
    });
});
