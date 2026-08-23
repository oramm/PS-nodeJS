/**
 * Filtr „Integracja z FIDmanem" na liście kontraktów
 * (ContractSearchParams.fidmanIntegrationFilter).
 *
 * Test jednostkowy (ToolsDb zmockowany, bez realnego MySQL), więc pokrywa to, co da się
 * sprawdzić bez bazy:
 *  (a) makeAndConditions() dokłada warunek dla obu wartości i pomija go dla pustej/braku;
 *  (b) treść wygenerowanego SQL pyta o `FidmanContractId`, a NIE o status w FidmanSyncOutbox
 *      (decyzja właściciela: stan integracji czyta się z trwałego linku PK↔PK z migracji 004);
 *  (c) gałąź „do zintegrowania" zawęża się po `TypeId` z allowlisty syncu, a nie po nazwie
 *      typu — to jest właśnie ta rozbieżność względem makeAtypicalSettlementCondition(),
 *      którą łatwo „naprawić" w złą stronę (uzasadnienie przy metodzie w ContractRepository);
 *  (d) pusta allowlista nie generuje `IN ()`, czyli składniowo błędnego SQL.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../tools/ToolsDb');

import ToolsDb from '../../tools/ToolsDb';
import ContractRepository from '../ContractRepository';
import ContractEntityAssociationsHelper from '../ContractEntityAssociationsHelper';

const ORIG_TYPE_IDS = process.env.FIDMAN_SYNC_CONTRACT_TYPE_IDS;

describe('ContractRepository — fidmanIntegrationFilter', () => {
    let repository: ContractRepository;

    beforeEach(() => {
        process.env.FIDMAN_SYNC_CONTRACT_TYPE_IDS = '3,4';
        repository = new ContractRepository();
    });

    afterEach(() => {
        if (ORIG_TYPE_IDS === undefined)
            delete process.env.FIDMAN_SYNC_CONTRACT_TYPE_IDS;
        else process.env.FIDMAN_SYNC_CONTRACT_TYPE_IDS = ORIG_TYPE_IDS;
    });

    describe('makeAndConditions — obecność warunku', () => {
        it('dokłada warunek dla INTEGRATED', () => {
            const result = (repository as any).makeAndConditions({
                fidmanIntegrationFilter: 'INTEGRATED',
            });

            expect(result).toContain('mainContracts.FidmanContractId');
        });

        it('dokłada warunek dla NOT_INTEGRATED', () => {
            const result = (repository as any).makeAndConditions({
                fidmanIntegrationFilter: 'NOT_INTEGRATED',
            });

            expect(result).toContain('mainContracts.FidmanContractId');
            expect(result).toContain('mainContracts.TypeId');
        });

        it('nie dokłada warunku przy pustej wartości (domyślny stan pola w formularzu)', () => {
            const result = (repository as any).makeAndConditions({
                fidmanIntegrationFilter: '',
            });

            expect(result).not.toContain('FidmanContractId');
        });

        it('nie dokłada warunku, gdy pole nie jest przekazane', () => {
            const result = (repository as any).makeAndConditions({});

            expect(result).not.toContain('FidmanContractId');
        });

        it('nie dokłada warunku przy nieznanej wartości', () => {
            const result = (repository as any).makeAndConditions({
                fidmanIntegrationFilter: 'CZY_JA_WIEM',
            });

            expect(result).not.toContain('FidmanContractId');
        });
    });

    describe('makeFidmanIntegrationCondition — treść warunku', () => {
        it('INTEGRATED pyta wyłącznie o istnienie linku, bez zawężania typu', () => {
            const sql: string = (
                repository as any
            ).makeFidmanIntegrationCondition('INTEGRATED');

            expect(sql).toContain('FidmanContractId IS NOT NULL');
            // Zawężanie po typie byłoby błędem: kontrakt, który ma link, jest zintegrowany
            // niezależnie od tego, czy jego typ nadal siedzi w allowliście.
            expect(sql).not.toContain('TypeId');
        });

        it('NOT_INTEGRATED wymaga braku linku ORAZ typu z allowlisty syncu', () => {
            const sql: string = (
                repository as any
            ).makeFidmanIntegrationCondition('NOT_INTEGRATED');

            expect(sql).toContain('FidmanContractId IS NULL');
            expect(sql).toMatch(/TypeId IN \(3, ?4\)/);
        });

        // WYK-1: przy metodzie stoi jawna deklaracja, że filtr pyta dokładnie tym samym
        // warunkiem, którym bramkowana jest wysyłka (isFidmanSyncEligible: typ I znacznik).
        // Zmiana bramki bez zmiany filtra zamieniłaby tę deklarację w kłamstwo — lista
        // „do zintegrowania" pokazywałaby umowy, których system nigdy nie wyśle.
        it('NOT_INTEGRATED wymaga też włączonego znacznika „Objęta synchronizacją"', () => {
            const sql: string = (
                repository as any
            ).makeFidmanIntegrationCondition('NOT_INTEGRATED');

            expect(sql).toContain('FidmanSyncEnabled = 1');
        });

        it('INTEGRATED znacznika NIE sprawdza — link do FIDmana to fakt dokonany, nie zgoda na wysyłkę', () => {
            const sql: string = (
                repository as any
            ).makeFidmanIntegrationCondition('INTEGRATED');

            expect(sql).not.toContain('FidmanSyncEnabled');
        });

        it('czyta stan z trwałego linku, a nie z kolejki wysyłkowej', () => {
            const integrated: string = (
                repository as any
            ).makeFidmanIntegrationCondition('INTEGRATED');
            const notIntegrated: string = (
                repository as any
            ).makeFidmanIntegrationCondition('NOT_INTEGRATED');

            expect(integrated).not.toContain('FidmanSyncOutbox');
            expect(notIntegrated).not.toContain('FidmanSyncOutbox');
        });

        it('dopasowuje po TypeId, a nie po nazwie typu (rozbieżność wobec filtra nietypowego rozliczenia — celowa)', () => {
            const sql: string = (
                repository as any
            ).makeFidmanIntegrationCondition('NOT_INTEGRATED');

            expect(sql).not.toContain('SUBSTRING_INDEX');
            expect(sql).not.toContain('ContractTypes.Name');
        });

        it('podąża za allowlistą z env, a nie za zaszytą listą 3,4', () => {
            process.env.FIDMAN_SYNC_CONTRACT_TYPE_IDS = '3,4,14';
            const sql: string = (
                repository as any
            ).makeFidmanIntegrationCondition('NOT_INTEGRATED');

            expect(sql).toMatch(/TypeId IN \(3, ?4, ?14\)/);
        });

        it('pusta allowlista daje warunek fałszywy, nie błędne `IN ()`', () => {
            process.env.FIDMAN_SYNC_CONTRACT_TYPE_IDS = '';
            const sql: string = (
                repository as any
            ).makeFidmanIntegrationCondition('NOT_INTEGRATED');

            expect(sql).toBe('0');
            expect(sql).not.toContain('IN ()');
        });
    });
});

/**
 * WYK-1 — znacznik musi DOJŚĆ z bazy na model umowy.
 *
 * To jest ogniwo, od którego zależy skrypt masowego dopchnięcia (src/scripts/fidman-backfill.ts):
 * czyta on umowy przez ContractsController.find(), a potem pyta o znacznik bramką
 * isFidmanSyncEligible(). Gdyby kolumna nie trafiła do listy SELECT albo do mapowania wiersza
 * na model, znacznik byłby zawsze `undefined` i skrypt — bramkowany fail-closed — nie
 * zakolejkowałby NICZEGO, wyglądając przy tym na działający poprawnie.
 *
 * Rozróżnienie trzech stanów jest tu istotne: wiersz z zapytania, które kolumny nie wybiera,
 * ma zostać `undefined`, a nie udawać jawnego `false`. Zapis takiego obiektu z powrotem do
 * bazy nie ma prawa wyzerować cudzej wartości.
 */
describe('ContractRepository — znacznik FidmanSyncEnabled z wiersza na model', () => {
    const baseRow: any = {
        Id: 55,
        Alias: 'ROB-TEST',
        Number: '001',
        Name: 'Umowa na roboty testowa',
        OurIdRelated: null,
        StartDate: '2026-01-01',
        EndDate: '2026-12-31',
        Value: null,
        Comment: '',
        Status: 'W trakcie',
        GdFolderId: null,
        MeetingProtocolsGdFolderId: null,
        MaterialCardsGdFolderId: null,
        LastUpdated: '2026-08-23 10:00:00',
        OurId: null,
        ProjectId: 1,
        ProjectOurId: 'PRJ-001',
        ProjectName: 'Projekt testowy',
        ProjectAlias: 'Alias',
        ProjectGdFolderId: null,
        MainContractTypeId: 3,
        TypeName: 'Żółty',
        TypeIsOur: 0,
        TypeDescription: 'Kontrakt na roboty',
        ContractRangesNames: null,
        entitiesPerProject: [],
        rangesPerContract: [],
    };

    const mapRow = (overrides: any) =>
        (new ContractRepository() as any).mapRowToModel({
            ...baseRow,
            ...overrides,
        });

    it('find() wybiera kolumnę FidmanSyncEnabled — bez tego mapowanie poniżej nie ma czego czytać', async () => {
        (ToolsDb.getQueryCallbackAsync as any).mockResolvedValue([]);
        const repository = new ContractRepository();
        const executeQuery = jest
            .spyOn(repository as any, 'executeQuery')
            .mockResolvedValue([] as any);
        jest.spyOn(
            ContractEntityAssociationsHelper,
            'getContractEntityAssociationsList'
        ).mockResolvedValue([] as any);

        await repository.find([{ id: 55 }]);

        const sql = String((executeQuery.mock.calls[0] as any[])[0]);
        expect(sql).toContain('mainContracts.FidmanSyncEnabled');
    });

    it('1 z bazy czyta jako umowę objętą synchronizacją', () => {
        expect(mapRow({ FidmanSyncEnabled: 1 }).fidmanSyncEnabled).toBe(true);
    });

    it('0 z bazy czyta jako umowę wykluczoną', () => {
        expect(mapRow({ FidmanSyncEnabled: 0 }).fidmanSyncEnabled).toBe(false);
    });

    it('wiersz bez tej kolumny zostawia undefined, a nie fałszywe „wykluczona"', () => {
        expect(mapRow({}).fidmanSyncEnabled).toBeUndefined();
    });
});
