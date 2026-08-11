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

import ContractRepository from '../ContractRepository';

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
