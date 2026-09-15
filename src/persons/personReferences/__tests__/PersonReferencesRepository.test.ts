import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import ToolsDb from '../../../tools/ToolsDb';
import PersonReferencesRepository, {
    buildReferenceCountsSql,
    mergeReferenceColumns,
    REFERENCE_COLUMNS_WITHOUT_FK,
} from '../PersonReferencesRepository';

jest.mock('../../../tools/ToolsDb');

/**
 * ROD-8: inwentarz odwołań do osoby. Kolumny z `information_schema` plus pięć kolumn edytora bez klucza
 * obcego; wiersz konta bez e-maila NIE jest powiązaniem. Jedno zapytanie na cały zbiór osób.
 */
describe('mergeReferenceColumns (ROD-8)', () => {
    it('scala odkryte klucze obce z listą bez klucza, bez duplikatów i bez wiersza konta', () => {
        const merged = mergeReferenceColumns([
            { table: 'letters', column: 'EditorId' },
            // pomijane: konto bez e-maila to nie powiązanie (ocenia się je po e-mailu)
            { table: 'personaccounts', column: 'PersonId' },
            // po ROD-6 klucz istnieje -> to samo, co pozycja listy statycznej, inną wielkością liter
            { table: 'letters_cases', column: 'EditorId' },
            { table: 'tasks', column: 'OwnerId' },
        ]);
        const keys = merged.map((c) => `${c.table}.${c.column}`.toLowerCase());
        expect(keys).toContain('letters.editorid');
        expect(keys).toContain('tasks.ownerid');
        expect(keys).not.toContain('personaccounts.personid');
        expect(keys.filter((k) => k === 'letters_cases.editorid')).toHaveLength(1);
        for (const col of REFERENCE_COLUMNS_WITHOUT_FK)
            expect(keys).toContain(`${col.table}.${col.column}`.toLowerCase());
        expect(merged).toHaveLength(2 + REFERENCE_COLUMNS_WITHOUT_FK.length);
    });
});

describe('buildReferenceCountsSql (ROD-8)', () => {
    it('jedno zapytanie UNION ALL z escapowanymi identyfikatorami i listą osób', () => {
        const sql = buildReferenceCountsSql(
            [
                { table: 'Letters', column: 'EditorId' },
                { table: 'Tasks', column: 'OwnerId' },
            ],
            [5, 17],
        );
        expect(sql.match(/SELECT /g)).toHaveLength(2);
        expect(sql).toContain('UNION ALL');
        expect(sql).toContain(
            'FROM `Letters` WHERE `EditorId` IN (5, 17) GROUP BY `EditorId`',
        );
        expect(sql).toContain("'Tasks.OwnerId' AS ref");
    });

    it('odrzuca numery osób spoza dodatnich liczb całkowitych i puste listy', () => {
        const cols = [{ table: 'Letters', column: 'EditorId' }];
        expect(() => buildReferenceCountsSql(cols, [1.5])).toThrow();
        expect(() =>
            buildReferenceCountsSql(cols, ['1; DROP TABLE Persons' as any]),
        ).toThrow();
        expect(() => buildReferenceCountsSql([], [1])).toThrow();
        expect(() => buildReferenceCountsSql(cols, [])).toThrow();
    });
});

describe('PersonReferencesRepository (ROD-8)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('countReferences grupuje liczby po osobie; osoba bez odwołań nie ma wpisu; pusta lista osób nie pyta bazy', async () => {
        jest.mocked(ToolsDb.getQueryCallbackAsync).mockResolvedValue([
            { ref: 'tasks.OwnerId', personId: 5, n: 2 },
            { ref: 'letters.EditorId', personId: 5, n: 3 },
            { ref: 'letters.EditorId', personId: 9, n: 1 },
        ] as any);
        const repo = new PersonReferencesRepository();
        const columns = [
            { table: 'letters', column: 'EditorId' },
            { table: 'tasks', column: 'OwnerId' },
        ];

        const counts = await repo.countReferences([5, 7, 9], columns);

        expect(counts.get(5)).toEqual([
            { ref: 'letters.EditorId', count: 3 },
            { ref: 'tasks.OwnerId', count: 2 },
        ]);
        expect(counts.get(9)).toEqual([{ ref: 'letters.EditorId', count: 1 }]);
        expect(counts.has(7)).toBe(false);
        expect(ToolsDb.getQueryCallbackAsync).toHaveBeenCalledTimes(1);

        const empty = await repo.countReferences([], columns);
        expect(empty.size).toBe(0);
        expect(ToolsDb.getQueryCallbackAsync).toHaveBeenCalledTimes(1);
    });

    it('findReferenceColumns pyta information_schema o klucze do Persons i dokłada kolumny bez klucza', async () => {
        jest.mocked(ToolsDb.getQueryCallbackAsync).mockResolvedValue([
            { tableName: 'letters', columnName: 'EditorId' },
            { tableName: 'personaccounts', columnName: 'PersonId' },
        ] as any);

        const cols = await new PersonReferencesRepository().findReferenceColumns();

        const sql = jest.mocked(ToolsDb.getQueryCallbackAsync).mock
            .calls[0][0] as string;
        expect(sql).toMatch(/information_schema\.KEY_COLUMN_USAGE/);
        expect(sql).toMatch(/LOWER\(REFERENCED_TABLE_NAME\) = 'persons'/);
        expect(sql).toMatch(/TABLE_SCHEMA = DATABASE\(\)/);
        expect(cols.map((c) => `${c.table}.${c.column}`)).toEqual([
            'letters.EditorId',
            ...REFERENCE_COLUMNS_WITHOUT_FK.map((c) => `${c.table}.${c.column}`),
        ]);
    });
});
