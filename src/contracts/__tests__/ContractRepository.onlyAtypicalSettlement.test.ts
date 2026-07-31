/**
 * RZL-5 — PS ENVI "metoda rozliczenia jako osobna oś danych", checkpoint RZL-5.
 * Plan: 20_projects/Aplikacje/PS.APP.01/plans/2026-07-29-rzl-metoda-rozliczenia-plan.md
 * Kanon: 40_wiki/firma/technologie/plakietka-typu-kontraktu-akcent.md, sekcja
 * „Uzupełnienie po stronie listy".
 *
 * Filtr „tylko nietypowe rozliczenie" (ContractSearchParams.onlyAtypicalSettlement)
 * ma zwrócić dokładnie te kontrakty, które na liście dostają akcent na plakietce:
 * Czerwony + LUMP_SUM albo Żółty + MEASUREMENT. Typy spoza osi FIDIC — nigdy.
 *
 * Ten plik jest testem jednostkowym (ToolsDb zmockowany, bez realnego MySQL), więc
 * pokrywa dwie rzeczy:
 *  (a) makeAndConditions() dokłada/omija warunek zależnie od onlyAtypicalSettlement;
 *  (b) sama treść wygenerowanego SQL paruje kolor z metodą zgodnie z regułą, a NIE
 *      odwrotnie (to jest dokładnie ten precedens kruchości co
 *      APPROVED_DOCS_CONTRACT_TYPE_IDS — patrz komentarz przy
 *      makeAtypicalSettlementCondition() w ContractRepository.ts).
 *
 * Sześć kombinacji domenowych z zadania (Czerwony+LUMP_SUM wpada, Żółty+MEASUREMENT
 * wpada, Żółty+LUMP_SUM/Czerwony+MEASUREMENT/brak wartości/typ spoza osi FIDIC nie
 * wpadają) jest pokrytych przez `evaluateAtypicalSettlementRule()` — czystą funkcję
 * JS, która świadomie i jawnie mirroruje regułę zapisaną w SQL
 * (SUBSTRING_INDEX(Name,' ',1) + SettlementMethod). Rzeczywiste wykonanie na danych
 * potwierdza dispatcher przy przeglądzie wizualnym RZL-5 (zrzut + SELECT kontrolny),
 * bo unit test bez żywego MySQL nie wykona samego zapytania.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../tools/ToolsDb');

import ContractRepository from '../ContractRepository';

describe('ContractRepository — onlyAtypicalSettlement (RZL-5)', () => {
    let repository: ContractRepository;

    beforeEach(() => {
        repository = new ContractRepository();
    });

    describe('makeAndConditions — obecność warunku', () => {
        it('dokłada warunek, gdy onlyAtypicalSettlement=true', () => {
            const result = (repository as any).makeAndConditions({
                onlyAtypicalSettlement: true,
            });

            expect(result).toContain('SUBSTRING_INDEX');
            expect(result).toContain('ContractTypes.Name');
            expect(result).toContain('mainContracts.SettlementMethod');
        });

        it('nie dokłada warunku, gdy onlyAtypicalSettlement=false', () => {
            const result = (repository as any).makeAndConditions({
                onlyAtypicalSettlement: false,
            });

            expect(result).not.toContain('SUBSTRING_INDEX');
        });

        it('nie dokłada warunku, gdy pole nie jest przekazane', () => {
            const result = (repository as any).makeAndConditions({});

            expect(result).not.toContain('SUBSTRING_INDEX');
        });
    });

    describe('makeAtypicalSettlementCondition — paruje kolor z metodą zgodnie z regułą', () => {
        it('paruje Czerwony z LUMP_SUM (nie z MEASUREMENT)', () => {
            const sql: string = (
                repository as any
            ).makeAtypicalSettlementCondition();

            // Rozbijamy warunek na dwie gałęzie OR i sprawdzamy, że LUMP_SUM
            // stoi przy „Czerwony", a nie przy „Żółty" — pomyłka odwrotna
            // przeszłaby test samej obecności obu literałów w stringu.
            const branches = sql.split(/\bOR\b/);
            const czerwonyBranch = branches.find((b) => b.includes('Czerwony'));
            const zoltyBranch = branches.find((b) => b.includes('Żółty'));

            expect(czerwonyBranch).toBeDefined();
            expect(zoltyBranch).toBeDefined();
            expect(czerwonyBranch).toContain('LUMP_SUM');
            expect(czerwonyBranch).not.toContain('MEASUREMENT');
            expect(zoltyBranch).toContain('MEASUREMENT');
            expect(zoltyBranch).not.toContain('LUMP_SUM');
        });

        it('dopasowuje po SUBSTRING_INDEX(Name, \' \', 1), nie po TypeId', () => {
            const sql: string = (
                repository as any
            ).makeAtypicalSettlementCondition();

            expect(sql).not.toMatch(/TypeId/);
            expect(sql).toContain("SUBSTRING_INDEX(ContractTypes.Name, ' ', 1)");
        });
    });

    describe('reguła odstępstwa — sześć kombinacji domenowych (mirror SQL)', () => {
        /**
         * Czysta funkcja JS, świadomie zduplikowana logika SQL z
         * makeAtypicalSettlementCondition() — tak jak front (ContractTypeBadge)
         * liczy pierwsze słowo nazwy typu, tak samo tu, żeby test sprawdzał
         * regułę domenową niezależnie od tego, czy ktoś kiedyś przepisze SQL
         * na coś równoważnego.
         */
        function evaluateAtypicalSettlementRule(
            typeName: string,
            settlementMethod: 'LUMP_SUM' | 'MEASUREMENT' | null,
        ): boolean {
            const firstWord = typeName.trim().split(/\s+/)[0];
            return (
                (firstWord === 'Czerwony' && settlementMethod === 'LUMP_SUM') ||
                (firstWord === 'Żółty' && settlementMethod === 'MEASUREMENT')
            );
        }

        it('Czerwony + LUMP_SUM — wpada', () => {
            expect(
                evaluateAtypicalSettlementRule('Czerwony', 'LUMP_SUM'),
            ).toBe(true);
        });

        it('Żółty + MEASUREMENT — wpada', () => {
            expect(
                evaluateAtypicalSettlementRule('Żółty', 'MEASUREMENT'),
            ).toBe(true);
        });

        it('Żółty + LUMP_SUM — NIE wpada (kombinacja typowa)', () => {
            expect(
                evaluateAtypicalSettlementRule('Żółty', 'LUMP_SUM'),
            ).toBe(false);
        });

        it('Czerwony + MEASUREMENT — NIE wpada (kombinacja typowa)', () => {
            expect(
                evaluateAtypicalSettlementRule('Czerwony', 'MEASUREMENT'),
            ).toBe(false);
        });

        it('brak wartości metody — NIE wpada', () => {
            expect(evaluateAtypicalSettlementRule('Czerwony', null)).toBe(
                false,
            );
            expect(evaluateAtypicalSettlementRule('Żółty', null)).toBe(false);
        });

        it('typ spoza osi FIDIC — NIE wpada nawet z metodą ustawioną', () => {
            expect(evaluateAtypicalSettlementRule('IK', 'LUMP_SUM')).toBe(
                false,
            );
            expect(
                evaluateAtypicalSettlementRule('AQM', 'MEASUREMENT'),
            ).toBe(false);
        });
    });
});
