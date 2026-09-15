import { describe, expect, it } from '@jest/globals';
import {
    attachReferences,
    formatDate,
    formatIdsOnlyLine,
    formatReferences,
    formatReviewLine,
    REVIEW_HEADER,
    summarize,
    UnlinkedPersonReportEntry,
} from '../unlinkedPersonsReport';

/**
 * ROD-8: raport ma dwa tryby. Domyślny drukuje SAME numery (wolno wkleić do notatki), `--review`
 * dodaje dane osobowe (tylko na ekran / plik lokalny). Test pilnuje, żeby tryb domyślny nigdy nie
 * wyniósł imienia, nazwiska ani nazwy podmiotu.
 */
const entry: UnlinkedPersonReportEntry = {
    id: 5,
    entityId: 12,
    accountUpdatedAt: new Date(2026, 1, 12, 10, 0, 0),
    _name: 'Jan',
    _surname: 'Testowy',
    _position: 'Inspektor',
    _entityName: 'Gmina Testowa',
    references: [{ ref: 'letters.EditorId', count: 3 }],
};
const clean: UnlinkedPersonReportEntry = {
    ...entry,
    id: 6,
    accountUpdatedAt: null,
    references: [],
};

describe('unlinkedPersonsReport (ROD-8)', () => {
    it('wiersz domyślny ma same numery i liczby - żadnego imienia, nazwiska ani nazwy podmiotu', () => {
        const line = formatIdsOnlyLine(entry);
        expect(line).toBe(
            '5 (podmiot=12, konto=2026-02-12, ślady=letters.EditorId: 3)',
        );
        for (const secret of ['Jan', 'Testowy', 'Gmina'])
            expect(line).not.toContain(secret);
        expect(formatIdsOnlyLine(clean)).toBe(
            '6 (podmiot=12, konto=brak, ślady=brak)',
        );
    });

    it('wiersz --review dodaje dane osoby w kolumnach TSV zgodnych z nagłówkiem', () => {
        const line = formatReviewLine(entry);
        expect(line.split('\t')).toHaveLength(REVIEW_HEADER.split('\t').length);
        expect(line).toBe(
            [
                '5',
                'Testowy',
                'Jan',
                'Inspektor',
                'Gmina Testowa',
                '12',
                '2026-02-12',
                'letters.EditorId: 3',
            ].join('\t'),
        );
    });

    it('formatuje datę lokalnie i brak wartości jako „brak"', () => {
        expect(formatDate(null)).toBe('brak');
        expect(formatDate(new Date(2026, 1, 12, 23, 30))).toBe('2026-02-12');
        expect(formatReferences([])).toBe('brak');
    });

    it('podsumowanie liczy osoby ze śladami, bez śladów, z wierszem konta i podmioty', () => {
        const entries = attachReferences(
            [entry, clean].map(({ references, ...person }) => person),
            new Map([[5, [{ ref: 'letters.EditorId', count: 3 }]]]),
        );
        expect(entries[1].references).toEqual([]);
        expect(summarize(entries)).toEqual({
            total: 2,
            withReferences: 1,
            withoutReferences: 1,
            withAccountRow: 1,
            entities: 1,
        });
    });
});
