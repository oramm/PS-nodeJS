import { OAuth2Client } from 'google-auth-library';
import BaseController from '../../controllers/BaseController';
import ToolsGd from '../../tools/ToolsGd';
import ToolsSheets from '../../tools/ToolsSheets';
import ContractsWithChildrenController from '../ContractsWithChildrenController';
import { ContractsWithChildren } from '../ContractTypes';
import {
    buildCaseListFileName,
    buildCaseListMatrix,
    buildPersonLabel,
    HEADER_ROW_INDEX,
} from './CaseListSheetBuilder';
import CaseListSheetValidator from './CaseListSheetValidator';
import {
    CaseListMatrix,
    CaseListSheetParams,
    CaseListSheetResult,
    SHEET_LEVELS,
    SheetLevel,
} from './CaseListSheetTypes';

const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';
/** Podfolder na spisy — zakładany przy pierwszym generowaniu w folderze kontraktu. */
const REPORTS_FOLDER_NAME = 'Spisy spraw';
const SHEET_TITLE = 'Spis spraw';
/** Tytuł przejściowy przy podmianie zakładki — nie może kolidować z SHEET_TITLE. */
const TEMP_SHEET_TITLE = '__nowy__';

const COLUMN_WIDTHS = [90, 460, 150, 400, 170];

/**
 * Formatowanie różnicujące poziomy drzewa: im głębiej, tym jaśniejsze tło i lżejsza
 * czcionka. Kolorowanie warunkowe kolumny „Status" nakłada się na te tła (formatowanie
 * warunkowe ma pierwszeństwo), więc statusy pozostają czytelne na każdym poziomie.
 */
const LEVEL_FORMATS: Record<SheetLevel, any> = {
    [SHEET_LEVELS.MILESTONE]: {
        backgroundColor: gray(0.851),
        textFormat: { bold: true, fontSize: 12 },
    },
    [SHEET_LEVELS.CASE]: {
        backgroundColor: gray(0.937),
        textFormat: { bold: true, fontSize: 11 },
    },
    [SHEET_LEVELS.SUBCASE]: {
        backgroundColor: gray(0.969),
        textFormat: { italic: true, fontSize: 10 },
    },
    [SHEET_LEVELS.TASK]: {
        backgroundColor: gray(1),
        textFormat: { fontSize: 10 },
    },
};

/** Kolory statusów — te same odcienie co w raporcie scrumboarda. */
const STATUS_COLORS: { contains: string; color: any }[] = [
    { contains: 'Backlog', color: { red: 0.95, green: 0.95, blue: 0.95 } },
    { contains: 'rozpocz', color: { red: 0.85, green: 0.85, blue: 0.85 } },
    { contains: 'trak', color: { red: 1, green: 0.85, blue: 0.4 } },
    { contains: 'popra', color: { red: 1, green: 0.8, blue: 0.35 } },
    { contains: 'oczekiwa', color: { red: 0.72, green: 0.88, blue: 0.72 } },
    { contains: 'zrob', color: { red: 0.5, green: 0.78, blue: 0.5 } },
    { contains: 'Zamkni', color: { red: 0.8, green: 0.86, blue: 0.94 } },
    { contains: 'Na za', color: { red: 0.93, green: 0.93, blue: 0.86 } },
    // statusy kamieni — widoczne tylko w wariancie „wszystkie statusy"
    { contains: 'kończon', color: { red: 0.5, green: 0.78, blue: 0.5 } },
    { contains: 'Archiw', color: { red: 0.88, green: 0.88, blue: 0.88 } },
];

/**
 * Generuje „Spis spraw" kontraktu jako arkusz Google w podfolderze folderu kontraktu.
 *
 * Tożsamość pliku wyznacza KONFIGURACJA (statusy + osoby) zakodowana w nazwie:
 * ta sama konfiguracja nadpisuje swój arkusz (link zostaje), inna zakłada nowy obok.
 * Wszystko na koncie master przez withAuth — jak reszta operacji na GD.
 */
export default class CaseListSheetController extends BaseController<any, any> {
    private static instance: CaseListSheetController;

    private constructor() {
        super(null as any);
    }

    private static getInstance(): CaseListSheetController {
        if (!this.instance) this.instance = new CaseListSheetController();
        return this.instance;
    }

    /** Walidacja po stronie Controllera — Router zostaje cienki i każde wejście
     *  do generowania przechodzi przez ten sam Validator. */
    static async generate(
        body: unknown,
        auth?: OAuth2Client
    ): Promise<CaseListSheetResult> {
        const params = CaseListSheetValidator.parseParams(body);
        return await this.withAuth(
            async (_instance, authClient) =>
                await CaseListSheetController.generateSheet(params, authClient),
            auth
        );
    }

    private static async generateSheet(
        params: CaseListSheetParams,
        auth: OAuth2Client
    ): Promise<CaseListSheetResult> {
        // statusType 'all' — filtrowanie statusów robimy w builderze, żeby jedno
        // miejsce decydowało o tym, co znaczy „bez zakończonych".
        const [contractWithChildren] =
            await ContractsWithChildrenController.find([
                { contractId: params.contractId, statusType: 'all' },
            ]);
        if (!contractWithChildren)
            throw new Error(`Nie znaleziono kontraktu ${params.contractId}`);

        const contract: any = contractWithChildren.contract;
        if (!contract.gdFolderId)
            throw new Error(
                'Kontrakt nie ma folderu na Google Drive - nie ma gdzie zapisać spisu'
            );

        const personLabels = CaseListSheetController.resolvePersonLabels(
            contractWithChildren,
            params.personIds
        );
        const matrix = buildCaseListMatrix(contractWithChildren, params, {
            generatedAt: new Date(),
            personLabels,
        });
        const name = buildCaseListFileName(params, personLabels);

        const reportsFolder = await ToolsGd.setFolder(auth, {
            parentId: contract.gdFolderId,
            name: REPORTS_FOLDER_NAME,
        });
        const existing = await ToolsGd.getFileMetaDataByNameAndMimeType(auth, {
            parentId: reportsFolder.id as string,
            fileName: name,
            mimeType: SPREADSHEET_MIME,
        });

        let gdId = existing?.id as string | undefined;
        const overwritten = !!gdId;
        if (!gdId) {
            const created = await ToolsGd.createNativeFile(auth, {
                name,
                parentId: reportsFolder.id as string,
                mimeType: SPREADSHEET_MIME,
            });
            gdId = created.id as string;
            await ToolsGd.createPermissions(auth, { fileId: gdId });
        }

        // Świeża zakładka zamiast czyszczenia: kasuje też grupowania i formatowanie
        // warunkowe z poprzedniego przebiegu, które inaczej by się nawarstwiały.
        const sheetId = await CaseListSheetController.resetSheet(
            auth,
            gdId,
            matrix
        );

        const updated = await ToolsSheets.updateValues(auth, {
            spreadsheetId: gdId,
            rangeA1: `'${SHEET_TITLE}'!A1`,
            values: matrix.values,
        });
        // updateValues połyka błąd i zwraca undefined — bez tej kontroli oddalibyśmy
        // użytkownikowi link do pustego arkusza jako sukces.
        if (!updated)
            throw new Error('Nie udało się zapisać danych do arkusza Google');

        await CaseListSheetController.applyFormatting(
            auth,
            gdId,
            sheetId,
            matrix
        );

        return {
            gdId,
            url: `https://docs.google.com/spreadsheets/d/${gdId}`,
            name,
            overwritten,
        };
    }

    /**
     * Nazwy wybranych osób — z właścicieli zadań w tym kontrakcie (lista w oknie
     * generowania pochodzi z tego samego źródła, więc każdy wybór jest rozwiązywalny).
     */
    private static resolvePersonLabels(
        contractWithChildren: ContractsWithChildren,
        personIds: number[]
    ): string[] {
        if (!personIds.length) return [];
        const labelsById = new Map<number, string>();
        for (const { casesWithTasks } of contractWithChildren
            .milestonesWithCases ?? [])
            for (const caseWithTasks of casesWithTasks ?? []) {
                const taskGroups = [
                    caseWithTasks.tasks,
                    ...(caseWithTasks.subCasesWithTasks ?? []).map(
                        (s) => s.tasks
                    ),
                ];
                for (const tasks of taskGroups)
                    for (const task of (tasks ?? []) as any[])
                        if (task.ownerId && task._owner)
                            labelsById.set(
                                task.ownerId,
                                buildPersonLabel(task._owner)
                            );
            }
        return personIds.map(
            (id) => labelsById.get(id) || `Osoba #${id}`
        );
    }

    /** Podmienia zakładkę na pustą — zwraca sheetId nowej. Plik (i link) zostaje ten sam. */
    private static async resetSheet(
        auth: OAuth2Client,
        spreadsheetId: string,
        matrix: CaseListMatrix
    ): Promise<number> {
        const spreadsheet = await ToolsSheets.getSpreadSheet(
            auth,
            spreadsheetId
        );
        const sheets = spreadsheet.data.sheets ?? [];
        const usedIds = sheets.map((s) => s.properties?.sheetId ?? 0);
        const newSheetId = Math.max(0, ...usedIds) + 1;

        await ToolsSheets.batchUpdateSheet(
            auth,
            [
                {
                    addSheet: {
                        properties: {
                            sheetId: newSheetId,
                            title: TEMP_SHEET_TITLE,
                            index: 0,
                            // Siatka pod rozmiar danych — domyślne 1000 wierszy nowej
                            // zakładki potrafi nie wystarczyć dużemu kontraktowi,
                            // a zapis poza siatkę kończy się błędem.
                            gridProperties: {
                                rowCount: Math.max(matrix.values.length + 10, 100),
                                columnCount: Math.max(matrix.colCount, 5),
                            },
                        },
                    },
                },
                // Zakładki bez sheetId pomijamy — pominięte pole API czyta jako 0,
                // czyli skasowałoby nie tę zakładkę, o którą chodzi.
                ...sheets
                    .filter((s) => typeof s.properties?.sheetId === 'number')
                    .map((s) => ({
                        deleteSheet: { sheetId: s.properties?.sheetId },
                    })),
                {
                    updateSheetProperties: {
                        properties: {
                            sheetId: newSheetId,
                            title: SHEET_TITLE,
                            index: 0,
                        },
                        fields: 'title,index',
                    },
                },
            ],
            spreadsheetId
        );
        return newSheetId;
    }

    private static async applyFormatting(
        auth: OAuth2Client,
        gdId: string,
        sheetId: number,
        matrix: CaseListMatrix
    ): Promise<void> {
        const { colCount, values, groups, levelRuns } = matrix;
        const rowCount = values.length;
        const dataStartRow = HEADER_ROW_INDEX + 1;
        const requests: any[] = [];

        // Tytuł i opis konfiguracji scalone na całą szerokość tabeli. Bez tego długi
        // tekst zawija się w wąskiej kolumnie „Poziom" i rozpycha oba wiersze na
        // kilkanaście linii wysokości.
        for (const rowIndex of [0, 1])
            requests.push({
                mergeCells: {
                    range: {
                        sheetId,
                        startRowIndex: rowIndex,
                        endRowIndex: rowIndex + 1,
                        startColumnIndex: 0,
                        endColumnIndex: colCount,
                    },
                    mergeType: 'MERGE_ALL',
                },
            });

        // Tytuł i podtytuł z konfiguracją
        requests.push(
            repeatCell(sheetId, 0, 1, 0, colCount, {
                textFormat: { bold: true, fontSize: 12 },
            }),
            repeatCell(sheetId, 1, 2, 0, colCount, {
                textFormat: { italic: true, foregroundColor: gray(0.4) },
            }),
            // Nagłówki kolumn — pogrubione na szarym tle
            repeatCell(sheetId, HEADER_ROW_INDEX, HEADER_ROW_INDEX + 1, 0, colCount, {
                textFormat: { bold: true },
                backgroundColor: gray(0.9),
            })
        );

        // Nagłówki zostają na wierzchu przy przewijaniu
        requests.push({
            updateSheetProperties: {
                properties: {
                    sheetId,
                    gridProperties: { frozenRowCount: dataStartRow },
                },
                fields: 'gridProperties.frozenRowCount',
            },
        });

        // Zawijanie treści + wyrównanie do góry w całej tabeli
        if (rowCount > dataStartRow)
            requests.push(
                repeatCell(sheetId, 0, rowCount, 0, colCount, {
                    wrapStrategy: 'WRAP',
                    verticalAlignment: 'TOP',
                })
            );

        // Wyróżnienie poziomów drzewa — po zawijaniu, bo dotyka innych pól formatu
        // (tło i czcionka), więc nie kasuje ustawionego wyżej WRAP-a.
        for (const run of levelRuns)
            requests.push(
                repeatCell(
                    sheetId,
                    run.startRow,
                    run.endRow,
                    0,
                    colCount,
                    LEVEL_FORMATS[run.level]
                )
            );

        // Szerokości kolumn — stałe, bo autoResize przy zawijaniu rozjeżdża tabelę
        for (let col = 0; col < colCount; col++)
            requests.push({
                updateDimensionProperties: {
                    range: {
                        sheetId,
                        dimension: 'COLUMNS',
                        startIndex: col,
                        endIndex: col + 1,
                    },
                    properties: { pixelSize: COLUMN_WIDTHS[col] ?? 200 },
                    fields: 'pixelSize',
                },
            });

        // Zwijane gałęzie drzewa (+/- z lewej strony arkusza)
        for (const group of groups)
            requests.push({
                addDimensionGroup: {
                    range: {
                        sheetId,
                        dimension: 'ROWS',
                        startIndex: group.startRow,
                        endIndex: group.endRow,
                    },
                },
            });

        // Kolorowanie kolumny „Status" (indeks 2)
        if (rowCount > dataStartRow)
            for (const rule of STATUS_COLORS)
                requests.push({
                    addConditionalFormatRule: {
                        index: 0,
                        rule: {
                            ranges: [
                                {
                                    sheetId,
                                    startRowIndex: dataStartRow,
                                    endRowIndex: rowCount,
                                    startColumnIndex: 2,
                                    endColumnIndex: 3,
                                },
                            ],
                            booleanRule: {
                                condition: {
                                    type: 'TEXT_CONTAINS',
                                    values: [{ userEnteredValue: rule.contains }],
                                },
                                format: { backgroundColor: rule.color },
                            },
                        },
                    },
                });

        await ToolsSheets.batchUpdateSheet(auth, requests, gdId);
    }
}

function repeatCell(
    sheetId: number,
    startRowIndex: number,
    endRowIndex: number,
    startColumnIndex: number,
    endColumnIndex: number,
    userEnteredFormat: any
): any {
    return {
        repeatCell: {
            range: {
                sheetId,
                startRowIndex,
                endRowIndex,
                startColumnIndex,
                endColumnIndex,
            },
            cell: { userEnteredFormat },
            fields: Object.keys(userEnteredFormat)
                .map((key) => `userEnteredFormat.${key}`)
                .join(','),
        },
    };
}

function gray(level: number) {
    return { red: level, green: level, blue: level };
}
