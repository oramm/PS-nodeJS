/// <reference types="jest" />
import { describe, expect, it } from '@jest/globals';
import Setup from '../../../setup/Setup';
import type { ContractsWithChildren } from '../../ContractTypes';
import {
    buildCaseListFileName,
    buildCaseListMatrix,
    HEADER_ROW_INDEX,
} from '../CaseListSheetBuilder';
import CaseListSheetValidator from '../CaseListSheetValidator';
import type { CaseListSheetParams } from '../CaseListSheetTypes';
import { SHEET_LEVELS } from '../CaseListSheetTypes';

const KOWALSKI = { id: 1, name: 'Jan', surname: 'Kowalski' };
const NOWAK = { id: 2, name: 'Anna', surname: 'Nowak' };

const CONTEXT = { generatedAt: new Date(2026, 6, 31, 14, 22), personLabels: [] };

function makeTask(overrides: any = {}) {
    return {
        id: 100,
        name: 'Zadanie',
        description: '',
        status: Setup.TaskStatus.IN_PROGRESS,
        ownerId: KOWALSKI.id,
        _owner: KOWALSKI,
        ...overrides,
    };
}

function makeCase(overrides: any = {}) {
    return {
        id: 10,
        name: 'Sprawa',
        description: '',
        status: Setup.CaseStatus.IN_PROGRESS,
        number: 1,
        gdFolderId: 'case-folder',
        _type: { name: 'Uzgodnienia' },
        ...overrides,
    };
}

function makeMilestone(overrides: any = {}) {
    return {
        id: 7,
        name: '',
        status: Setup.MilestoneStatus.IN_PROGRESS,
        gdFolderId: 'milestone-folder',
        _type: { _folderNumber: '01', name: 'Projekt budowlany' },
        ...overrides,
    };
}

/** Drzewo: 1 kamień → 1 sprawa (+ opcjonalna podsprawa) → zadania. */
function makeTree(
    options: {
        milestoneStatus?: string;
        caseStatus?: string;
        tasks?: any[];
        subCase?: { caseItem: any; tasks: any[] };
        contractFolderId?: string;
        milestoneFolderId?: string;
        caseFolderId?: string;
        subCaseFolderId?: string;
    } = {}
): ContractsWithChildren {
    const casesWithTasks: any = {
        caseItem: makeCase({
            status: options.caseStatus,
            gdFolderId: options.caseFolderId ?? 'case-folder',
        }),
        tasks: options.tasks ?? [],
        subCasesWithTasks: options.subCase ? [options.subCase] : [],
    };

    if (options.subCase)
        options.subCase.caseItem.gdFolderId =
            options.subCaseFolderId ??
            options.subCase.caseItem.gdFolderId ??
            'subcase-folder';

    return {
        id: 5,
        contract: {
            id: 5,
            ourId: 'UM/2024/17',
            alias: 'Kwiatowa',
            name: 'Przebudowa ul. Kwiatowej',
            gdFolderId: options.contractFolderId ?? 'contract-folder',
        },
        milestonesWithCases: [
            {
                milestone: makeMilestone({
                    status: options.milestoneStatus,
                    gdFolderId: options.milestoneFolderId ?? 'milestone-folder',
                }),
                casesWithTasks: [casesWithTasks],
            },
        ],
    } as unknown as ContractsWithChildren;
}

function makeParams(
    overrides: Partial<CaseListSheetParams> = {}
): CaseListSheetParams {
    return {
        contractId: 5,
        includeFinished: false,
        personIds: [],
        ...overrides,
    };
}

/** Wiersze danych — bez tytułu, konfiguracji, odstępu i nagłówka kolumn. */
function dataRows(values: any[][]) {
    return values.slice(HEADER_ROW_INDEX + 1);
}

/** Sama nazwa, bez wcięcia niełamliwymi spacjami. */
function displayText(cell: any): string {
    return String(cell ?? '').replace(/^ +/, '');
}

describe('buildCaseListMatrix - linki do folderów na GD', () => {
    it('linkuje nazwy kontraktu, kamienia i sprawy', () => {
        const matrix = buildCaseListMatrix(
            makeTree(),
            makeParams({ includeFinished: true }),
            CONTEXT
        );

        expect(matrix.values[0][0]).toBe(
            'Spis spraw - UM/2024/17 | Kwiatowa | Przebudowa ul. Kwiatowej'
        );
        expect(matrix.linkRows).toEqual(
            expect.arrayContaining([
                {
                    rowIndex: 0,
                    columnIndex: 0,
                    startIndex: 0,
                    url: 'https://drive.google.com/drive/folders/contract-folder',
                },
                {
                    rowIndex: 4,
                    columnIndex: 1,
                    startIndex: 0,
                    url: 'https://drive.google.com/drive/folders/milestone-folder',
                },
                {
                    rowIndex: 5,
                    columnIndex: 1,
                    startIndex: 4,
                    url: 'https://drive.google.com/drive/folders/case-folder',
                },
            ])
        );
        expect(displayText(matrix.values[4][1])).toBe('01 Projekt budowlany');
        expect(displayText(matrix.values[5][1])).toBe('Uzgodnienia 1 Sprawa');
    });

    it('link zaczyna się za wcięciem, żeby podkreślenie go nie obejmowało', () => {
        const matrix = buildCaseListMatrix(
            makeTree({
                subCase: {
                    caseItem: makeCase({
                        id: 11,
                        name: 'Podsprawa',
                        number: 2,
                        gdFolderId: 'subcase-folder',
                    }),
                    tasks: [],
                },
            }),
            makeParams(),
            CONTEXT
        );

        for (const link of matrix.linkRows) {
            const text = String(matrix.values[link.rowIndex][link.columnIndex]);
            // dokładnie tyle znaków wcięcia, ile jest w komórce — ani mniej, ani więcej
            expect(text.slice(0, link.startIndex)).toMatch(/^ *$/);
            expect(text[link.startIndex]).not.toBe(' ');
        }
    });
});

describe('buildCaseListMatrix - filtr statusów', () => {
    it('bez zakończonych: wycina zamknięte sprawy, zrobione zadania i zakończone kamienie', () => {
        const tree = makeTree({
            tasks: [
                makeTask({
                    id: 101,
                    name: 'Zrobione zadanie',
                    status: Setup.TaskStatus.DONE,
                }),
                makeTask({ id: 102, name: 'Aktywne zadanie' }),
            ],
        });
        const rows = dataRows(
            buildCaseListMatrix(tree, makeParams(), CONTEXT).values
        );
        const names = rows.map((r) => displayText(r[1]));

        expect(names).toContain('Aktywne zadanie');
        expect(names).not.toContain('Zrobione zadanie');
    });

    it('bez zakończonych: zadania z Backlogu zostają', () => {
        const tree = makeTree({
            tasks: [
                makeTask({
                    name: 'Backlogowe',
                    status: Setup.TaskStatus.BACKLOG,
                }),
            ],
        });
        const rows = dataRows(
            buildCaseListMatrix(tree, makeParams(), CONTEXT).values
        );

        expect(rows.map((r) => displayText(r[1]))).toContain('Backlogowe');
    });

    it('bez zakończonych: zamknięta sprawa i zakończony kamień znikają', () => {
        const closedCase = buildCaseListMatrix(
            makeTree({ caseStatus: Setup.CaseStatus.CLOSED }),
            makeParams(),
            CONTEXT
        );
        expect(dataRows(closedCase.values).map((r) => r[0])).toEqual([
            SHEET_LEVELS.MILESTONE,
        ]);

        const finishedMilestone = buildCaseListMatrix(
            makeTree({ milestoneStatus: Setup.MilestoneStatus.FINISHED }),
            makeParams(),
            CONTEXT
        );
        expect(dataRows(finishedMilestone.values)).toHaveLength(0);
    });

    it('wszystkie statusy: nic nie jest wycinane', () => {
        const tree = makeTree({
            caseStatus: Setup.CaseStatus.CLOSED,
            tasks: [
                makeTask({ name: 'Zrobione', status: Setup.TaskStatus.DONE }),
            ],
        });
        const rows = dataRows(
            buildCaseListMatrix(
                tree,
                makeParams({ includeFinished: true }),
                CONTEXT
            ).values
        );

        expect(rows.map((r) => r[0])).toEqual([
            SHEET_LEVELS.MILESTONE,
            SHEET_LEVELS.CASE,
            SHEET_LEVELS.TASK,
        ]);
    });
});

describe('buildCaseListMatrix - filtr osób', () => {
    it('pokazuje zadania wybranych osób i zawsze nieprzypisane', () => {
        const tree = makeTree({
            tasks: [
                makeTask({ id: 101, name: 'Zadanie Kowalskiego' }),
                makeTask({
                    id: 102,
                    name: 'Zadanie Nowak',
                    ownerId: NOWAK.id,
                    _owner: NOWAK,
                }),
                makeTask({
                    id: 103,
                    name: 'Zadanie nieprzypisane',
                    ownerId: null,
                    _owner: undefined,
                }),
            ],
        });
        const rows = dataRows(
            buildCaseListMatrix(
                tree,
                makeParams({ personIds: [KOWALSKI.id] }),
                CONTEXT
            ).values
        );
        const names = rows.map((r) => displayText(r[1]));

        expect(names).toContain('Zadanie Kowalskiego');
        expect(names).toContain('Zadanie nieprzypisane');
        expect(names).not.toContain('Zadanie Nowak');
    });

    it('kolumna „Osoba" pojawia się dopiero przy kilku osobach', () => {
        const tree = makeTree({ tasks: [makeTask()] });

        expect(buildCaseListMatrix(tree, makeParams(), CONTEXT).colCount).toBe(
            4
        );
        expect(
            buildCaseListMatrix(
                tree,
                makeParams({ personIds: [KOWALSKI.id] }),
                CONTEXT
            ).colCount
        ).toBe(4);

        const withColumn = buildCaseListMatrix(
            tree,
            makeParams({ personIds: [KOWALSKI.id, NOWAK.id] }),
            CONTEXT
        );
        expect(withColumn.colCount).toBe(5);
        expect(withColumn.values[HEADER_ROW_INDEX][4]).toBe('Osoba');
        expect(dataRows(withColumn.values).at(-1)?.[4]).toBe('Jan Kowalski');
    });
});

describe('buildCaseListMatrix - struktura drzewa', () => {
    it('zostawia sprawy bez pasujących zadań', () => {
        const tree = makeTree({
            tasks: [makeTask({ ownerId: NOWAK.id, _owner: NOWAK })],
        });
        const rows = dataRows(
            buildCaseListMatrix(
                tree,
                makeParams({ personIds: [KOWALSKI.id] }),
                CONTEXT
            ).values
        );

        expect(rows.map((r) => r[0])).toEqual([
            SHEET_LEVELS.MILESTONE,
            SHEET_LEVELS.CASE,
        ]);
    });

    it('wcina nazwy wg poziomu i grupuje zagnieżdżone gałęzie', () => {
        const tree = makeTree({
            tasks: [makeTask({ name: 'Zadanie sprawy' })],
            subCase: {
                caseItem: makeCase({
                    id: 11,
                    name: 'Podsprawa',
                    number: 2,
                    gdFolderId: 'subcase-folder',
                }),
                tasks: [makeTask({ id: 104, name: 'Zadanie podsprawy' })],
            },
        });
        const matrix = buildCaseListMatrix(tree, makeParams(), CONTEXT);
        const rows = dataRows(matrix.values);

        expect(rows.map((r) => r[0])).toEqual([
            SHEET_LEVELS.MILESTONE,
            SHEET_LEVELS.CASE,
            SHEET_LEVELS.TASK,
            SHEET_LEVELS.SUBCASE,
            SHEET_LEVELS.TASK,
        ]);
        expect(displayText(rows[0][1])).toBe('01 Projekt budowlany');
        expect(displayText(rows[1][1])).toBe('Uzgodnienia 1 Sprawa');
        expect(displayText(rows[2][1])).toBe('Zadanie sprawy');
        expect(displayText(rows[3][1])).toBe('Uzgodnienia 2 Podsprawa');
        expect(displayText(rows[4][1])).toBe('Zadanie podsprawy');

        expect(matrix.linkRows.map((row) => row.rowIndex)).toEqual([0, 4, 5, 7]);
        expect(matrix.linkRows.find((row) => row.rowIndex === 7)?.url).toBe(
            'https://drive.google.com/drive/folders/subcase-folder'
        );

        const asOffsets = matrix.groups.map((g) => [
            g.startRow - (HEADER_ROW_INDEX + 1),
            g.endRow - (HEADER_ROW_INDEX + 1),
        ]);
        expect(asOffsets).toEqual(
            expect.arrayContaining([
                [1, 5], // wszystko pod kamieniem
                [2, 5], // zadanie sprawy + podsprawa z zadaniem
                [4, 5], // zadanie podsprawy
            ])
        );
    });

    it('zwija poziomy w ciągłe bloki do formatowania, z pominięciem wierszy nagłówka', () => {
        const tree = makeTree({
            tasks: [
                makeTask({ id: 101, name: 'Pierwsze' }),
                makeTask({ id: 102, name: 'Drugie' }),
            ],
            subCase: {
                caseItem: makeCase({
                    id: 11,
                    name: 'Podsprawa',
                    number: 2,
                    gdFolderId: 'subcase-folder',
                }),
                tasks: [makeTask({ id: 103, name: 'Zadanie podsprawy' })],
            },
        });
        const { levelRuns } = buildCaseListMatrix(tree, makeParams(), CONTEXT);
        const first = HEADER_ROW_INDEX + 1;

        // sąsiadujące zadania jednym blokiem — inaczej długi spis to setki żądań
        expect(levelRuns).toEqual([
            {
                level: SHEET_LEVELS.MILESTONE,
                startRow: first,
                endRow: first + 1,
            },
            { level: SHEET_LEVELS.CASE, startRow: first + 1, endRow: first + 2 },
            { level: SHEET_LEVELS.TASK, startRow: first + 2, endRow: first + 4 },
            {
                level: SHEET_LEVELS.SUBCASE,
                startRow: first + 4,
                endRow: first + 5,
            },
            { level: SHEET_LEVELS.TASK, startRow: first + 5, endRow: first + 6 },
        ]);
        // bloki pokrywają dokładnie wiersze danych, nie wchodzą w nagłówek
        expect(levelRuns[0].startRow).toBe(HEADER_ROW_INDEX + 1);
        expect(levelRuns.at(-1)?.endRow).toBe(
            buildCaseListMatrix(tree, makeParams(), CONTEXT).values.length
        );
    });

    it('nagłówek arkusza niesie kontrakt i użytą konfigurację', () => {
        const matrix = buildCaseListMatrix(
            makeTree({ tasks: [makeTask()] }),
            makeParams({ personIds: [KOWALSKI.id] }),
            {
                generatedAt: new Date(2026, 6, 31, 14, 22),
                personLabels: ['Jan Kowalski'],
            }
        );

        expect(matrix.values[0][0]).toContain('UM/2024/17');
        expect(matrix.values[0][0]).toContain('Przebudowa ul. Kwiatowej');
        expect(matrix.values[1][0]).toContain('2026-07-31 14:22');
        expect(matrix.values[1][0]).toContain('bez zakończonych');
        expect(matrix.values[1][0]).toContain('Jan Kowalski');
        expect(matrix.values[HEADER_ROW_INDEX]).toEqual([
            'Poziom',
            'Nazwa',
            'Status',
            'Uwagi',
        ]);
    });
});

describe('buildCaseListFileName', () => {
    it('koduje konfigurację, żeby ta sama trafiała w ten sam plik', () => {
        expect(buildCaseListFileName(makeParams(), [])).toBe(
            'Spis spraw - aktywne'
        );
        expect(
            buildCaseListFileName(makeParams({ includeFinished: true }), [])
        ).toBe('Spis spraw - wszystkie statusy');
        expect(buildCaseListFileName(makeParams(), ['Jan Kowalski'])).toBe(
            'Spis spraw - aktywne - Jan Kowalski'
        );
        expect(
            buildCaseListFileName(makeParams(), ['Jan Kowalski', 'Anna Nowak'])
        ).toBe('Spis spraw - aktywne - Jan Kowalski, Anna Nowak');
    });

    it('nie zależy od kolejności zaznaczania osób - inaczej ta sama konfiguracja dałaby dwa pliki', () => {
        expect(
            buildCaseListFileName(makeParams(), ['Anna Nowak', 'Jan Kowalski'])
        ).toBe(
            buildCaseListFileName(makeParams(), ['Jan Kowalski', 'Anna Nowak'])
        );
    });

    it('rozróżnia osoby o tym samym nazwisku - inaczej jeden spis nadpisałby drugi', () => {
        const withAnna = buildCaseListFileName(makeParams(), [
            'Anna Nowak',
            'Jan Kowalski',
        ]);
        const withPiotr = buildCaseListFileName(makeParams(), [
            'Piotr Nowak',
            'Jan Kowalski',
        ]);

        expect(withAnna).not.toBe(withPiotr);
    });
});

describe('CaseListSheetValidator.parseParams - personIds', () => {
    it('przyjmuje listę osób', () => {
        expect(
            CaseListSheetValidator.parseParams({
                contractId: 5,
                personIds: [2, 1, 2],
            }).personIds
        ).toEqual([1, 2]);
    });

    it('przyjmuje pojedynczą liczbę - middleware zwija [5] do 5 przez JSON.parse', () => {
        expect(
            CaseListSheetValidator.parseParams({ contractId: 5, personIds: 5 })
                .personIds
        ).toEqual([5]);
    });

    it('brak osób = cały kontrakt', () => {
        expect(
            CaseListSheetValidator.parseParams({ contractId: 5 }).personIds
        ).toEqual([]);
        expect(
            CaseListSheetValidator.parseParams({ contractId: 5, personIds: [] })
                .personIds
        ).toEqual([]);
    });

    it('odrzuca śmieci zamiast identyfikatorów', () => {
        expect(() =>
            CaseListSheetValidator.parseParams({
                contractId: 5,
                personIds: [{ id: 1 }],
            })
        ).toThrow();
        expect(() =>
            CaseListSheetValidator.parseParams({
                contractId: 5,
                personIds: ['abc'],
            })
        ).toThrow();
        expect(() =>
            CaseListSheetValidator.parseParams({ contractId: 0 })
        ).toThrow();
    });
});
