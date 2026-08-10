import { OAuth2Client } from 'google-auth-library';
import BaseController from '../../controllers/BaseController';
import ToolsGd from '../../tools/ToolsGd';
import ToolsSheets from '../../tools/ToolsSheets';
import ContractsController from '../../contracts/ContractsController';
import ContractsSettlementController from '../../contracts/ContractsSettlementController';
import { ProjectScope } from '../../types/sessionTypes';
import InvoicesController from '../InvoicesController';
import InvoiceItemsController from '../InvoiceItemsController';
import type InvoiceItem from '../InvoiceItem';
import {
    buildInvoiceSummaryMatrix,
    buildSummarySheetFileName,
    buildSummarySheetNamePrefix,
    HEADER_ROW_INDEX,
    InvoiceSummaryMatrix,
    SETTLEMENT_COL_COUNT,
    SETTLEMENT_LABEL_ROW_INDEX,
    SETTLEMENT_START_COLUMN,
    SETTLEMENT_VALUE_ROW_INDEX,
    SHEET_LEVELS,
    SheetLevel,
} from './InvoiceSummarySheetBuilder';

const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';
/** Podfolder na podsumowania — zakładany przy pierwszym generowaniu w folderze kontraktu. */
const REPORTS_FOLDER_NAME = 'Podsumowania faktur';
const SHEET_TITLE = 'Podsumowanie faktur';
/** Tytuł przejściowy przy podmianie zakładki — nie może kolidować z SHEET_TITLE. */
const TEMP_SHEET_TITLE = '__nowy__';

const COLUMN_WIDTHS = [120, 100, 150, 100, 140, 70, 110, 110, 1000];
/** Kolumny liczbowe: Ilość, Cena jedn., Netto (indeksy 0-based). */
const NUMBER_COLUMNS = [5, 6, 7];
/** Kolumna „Status" — po niej idzie kolorowanie warunkowe (0-based). */
const STATUS_COLUMN = 2;
const MONEY_PATTERN = '# ##0.00';
/**
 * O ile kolumn ostatni kafelek („Do zarejestrowania") wychodzi poza swoją kolumnę.
 * Wypada nad wąską kolumną „Ilość", więc jest scalany z sąsiednią — inaczej etykieta
 * i kwota się w niej nie mieszczą. Rozszerzanie samej kolumny odpada: rozjechałoby
 * tabelę faktur pod spodem.
 */
const SETTLEMENT_LAST_TILE_EXTRA_COLUMNS = 1;

const LEVEL_FORMATS: Record<SheetLevel, any> = {
    [SHEET_LEVELS.INVOICE]: {
        backgroundColor: gray(0.851),
        textFormat: { bold: true, fontSize: 11 },
    },
    [SHEET_LEVELS.ITEM]: {
        backgroundColor: gray(1),
        textFormat: { fontSize: 10 },
    },
    [SHEET_LEVELS.TOTAL]: {
        backgroundColor: gray(0.75),
        textFormat: { bold: true, fontSize: 12 },
    },
};

/** Kolory statusów faktur — te same grupy, którymi liczy się rozliczenie kontraktu. */
const STATUS_COLORS: { contains: string; color: any }[] = [
    { contains: 'Na później', color: { red: 0.95, green: 0.95, blue: 0.95 } },
    { contains: 'Do zrobienia', color: { red: 1, green: 0.85, blue: 0.4 } },
    { contains: 'Zrobiona', color: { red: 0.93, green: 0.93, blue: 0.86 } },
    { contains: 'Wysłana', color: { red: 0.72, green: 0.88, blue: 0.72 } },
    { contains: 'Zapłacona', color: { red: 0.5, green: 0.78, blue: 0.5 } },
    { contains: 'Wycofana', color: { red: 0.88, green: 0.88, blue: 0.88 } },
    { contains: 'Do korekty', color: { red: 1, green: 0.8, blue: 0.35 } },
    { contains: 'Odrzucona', color: { red: 0.96, green: 0.7, blue: 0.7 } },
    { contains: 'Skorygowana', color: { red: 0.8, green: 0.86, blue: 0.94 } },
];

/**
 * Generuje „Podsumowanie faktur" kontraktu jako arkusz Google w podfolderze folderu
 * kontraktu: wiersz faktury, pod nim zwijane wiersze jej pozycji, na końcu suma.
 *
 * Plik ma stałą nazwę, więc kolejne generowanie nadpisuje poprzedni arkusz i raz
 * wysłany link dalej działa. Wszystko na koncie master przez withAuth — jak reszta
 * operacji na GD.
 */
export default class InvoiceSummarySheetController extends BaseController<
    any,
    any
> {
    // Kontroler nie ma repozytorium — dane bierze z InvoicesController i spółki.
    // Konstruktor istnieje tylko dlatego, że withAuth tworzy instancję.
    private constructor() {
        super(null as any);
    }

    static async generate(
        body: unknown,
        scope?: ProjectScope,
        auth?: OAuth2Client
    ) {
        const contractId = parseContractId(body);
        return await this.withAuth(
            async (_instance, authClient) =>
                await InvoiceSummarySheetController.generateSheet(
                    contractId,
                    scope,
                    authClient
                ),
            auth
        );
    }

    private static async generateSheet(
        contractId: number,
        scope: ProjectScope | undefined,
        auth: OAuth2Client
    ) {
        const [contract] = await ContractsController.find(
            [{ id: contractId }],
            scope
        );
        if (!contract) throw new Error(`Nie znaleziono kontraktu ${contractId}`);
        if (!(contract as any).gdFolderId)
            throw new Error(
                'Kontrakt nie ma folderu na Google Drive - nie ma gdzie zapisać podsumowania'
            );

        const [invoices, items, settlementSums] = await Promise.all([
            InvoicesController.find([{ contractId }], false),
            InvoiceItemsController.find([{ contractId }]),
            ContractsSettlementController.getSums([{ id: contractId }], scope),
        ]);

        const generatedAt = new Date();
        const matrix = buildInvoiceSummaryMatrix(
            contract,
            invoices,
            groupItemsByInvoiceId(items),
            { generatedAt, settlement: settlementSums?.[0] }
        );

        return await InvoiceSummarySheetController.writeSheet(auth, {
            parentFolderId: (contract as any).gdFolderId,
            name: buildSummarySheetFileName(contract, generatedAt),
            namePrefix: buildSummarySheetNamePrefix(contract),
            matrix,
        });
    }

    /**
     * Kontrakt ma dokładnie jeden arkusz podsumowania — odnajdywany po prefiksie nazwy,
     * więc data w nazwie nie rozbija go na wiele plików. Przy kolejnym generowaniu
     * podmieniamy zawartość i nazwę tego samego pliku, żeby raz wysłany link działał dalej.
     */
    private static async writeSheet(
        auth: OAuth2Client,
        target: {
            parentFolderId: string;
            name: string;
            namePrefix: string;
            matrix: InvoiceSummaryMatrix;
        }
    ) {
        const { name, namePrefix, matrix } = target;
        const reportsFolder = await ToolsGd.setFolder(auth, {
            parentId: target.parentFolderId,
            name: REPORTS_FOLDER_NAME,
        });
        const existing = await ToolsGd.getFileMetaDataByNamePrefixAndMimeType(
            auth,
            {
                parentId: reportsFolder.id as string,
                namePrefix,
                mimeType: SPREADSHEET_MIME,
            }
        );

        let gdId = existing?.id as string | undefined;
        if (!gdId) {
            const created = await ToolsGd.createNativeFile(auth, {
                name,
                parentId: reportsFolder.id as string,
                mimeType: SPREADSHEET_MIME,
            });
            gdId = created.id as string;
            await ToolsGd.createPermissions(auth, { fileId: gdId });
        } else if (existing?.name !== name) {
            // Data w nazwie ma pokazywać ostatnie odświeżenie, a nie pierwsze utworzenie.
            await ToolsGd.updateFile(auth, { id: gdId, name });
        }

        // Świeża zakładka zamiast czyszczenia: kasuje też grupowania i formatowanie
        // warunkowe z poprzedniego przebiegu, które inaczej by się nawarstwiały.
        const sheetId = await InvoiceSummarySheetController.resetSheet(
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

        await InvoiceSummarySheetController.applyFormatting(
            auth,
            gdId,
            sheetId,
            matrix
        );

        return {
            url: `https://docs.google.com/spreadsheets/d/${gdId}`,
            name,
        };
    }

    /** Podmienia zakładkę na pustą — zwraca sheetId nowej. Plik (i link) zostaje ten sam. */
    private static async resetSheet(
        auth: OAuth2Client,
        spreadsheetId: string,
        matrix: InvoiceSummaryMatrix
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
                            // zakładki potrafi nie wystarczyć, a zapis poza siatkę
                            // kończy się błędem.
                            gridProperties: {
                                rowCount: Math.max(
                                    matrix.values.length + 10,
                                    100
                                ),
                                columnCount: Math.max(matrix.colCount, 10),
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
        matrix: InvoiceSummaryMatrix
    ): Promise<void> {
        const { colCount, values, groups, levelRuns } = matrix;
        const rowCount = values.length;
        const dataStartRow = HEADER_ROW_INDEX + 1;
        const requests: any[] = [];

        // Ostatni kafelek rozliczenia zajmuje dwie kolumny — patrz
        // SETTLEMENT_LAST_TILE_EXTRA_COLUMNS.
        const settlementLastTileStart =
            SETTLEMENT_START_COLUMN + SETTLEMENT_COL_COUNT - 1;
        const settlementEndColumn =
            settlementLastTileStart + 1 + SETTLEMENT_LAST_TILE_EXTRA_COLUMNS;

        // Tytuł i data scalone na całą szerokość tabeli. Bez tego długi tekst zawija
        // się w wąskiej pierwszej kolumnie i rozpycha oba wiersze na kilka linii.
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

        // Ostatni kafelek rozliczenia — etykieta i kwota, każda scalona osobno.
        for (const rowIndex of [
            SETTLEMENT_LABEL_ROW_INDEX,
            SETTLEMENT_VALUE_ROW_INDEX,
        ])
            requests.push({
                mergeCells: {
                    range: {
                        sheetId,
                        startRowIndex: rowIndex,
                        endRowIndex: rowIndex + 1,
                        startColumnIndex: settlementLastTileStart,
                        endColumnIndex: settlementEndColumn,
                    },
                    mergeType: 'MERGE_ALL',
                },
            });

        requests.push(
            repeatCell(sheetId, 0, 1, 0, colCount, {
                textFormat: { bold: true, fontSize: 12 },
            }),
            repeatCell(sheetId, 1, 2, 0, colCount, {
                textFormat: { italic: true, foregroundColor: gray(0.4) },
            }),
            repeatCell(
                sheetId,
                HEADER_ROW_INDEX,
                HEADER_ROW_INDEX + 1,
                0,
                colCount,
                {
                    textFormat: { bold: true },
                    backgroundColor: gray(0.9),
                }
            )
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

        // Wyróżnienie faktur i sumy — po zawijaniu, bo dotyka innych pól formatu
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

        // Format liczbowy kolumn kwotowych — po formatowaniu poziomów, żeby go nie zdjęły.
        if (rowCount > dataStartRow)
            for (const col of NUMBER_COLUMNS)
                requests.push(
                    repeatCell(sheetId, dataStartRow, rowCount, col, col + 1, {
                        numberFormat: {
                            type: 'NUMBER',
                            pattern: MONEY_PATTERN,
                        },
                        horizontalAlignment: 'RIGHT',
                    })
                );

        // Kafelki rozliczenia — etykiety pod spodem wartości byłyby mylące, więc
        // etykieta idzie nad kwotą, tak jak na stronie kontraktu.
        requests.push(
            repeatCell(
                sheetId,
                SETTLEMENT_LABEL_ROW_INDEX,
                SETTLEMENT_LABEL_ROW_INDEX + 1,
                SETTLEMENT_START_COLUMN,
                settlementEndColumn,
                {
                    textFormat: { fontSize: 9, foregroundColor: gray(0.35) },
                    horizontalAlignment: 'RIGHT',
                    wrapStrategy: 'WRAP',
                    verticalAlignment: 'BOTTOM',
                }
            ),
            repeatCell(
                sheetId,
                SETTLEMENT_VALUE_ROW_INDEX,
                SETTLEMENT_VALUE_ROW_INDEX + 1,
                SETTLEMENT_START_COLUMN,
                settlementEndColumn,
                {
                    textFormat: { bold: true, fontSize: 12 },
                    numberFormat: { type: 'NUMBER', pattern: MONEY_PATTERN },
                    horizontalAlignment: 'RIGHT',
                    backgroundColor: gray(0.93),
                }
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
                    properties: { pixelSize: COLUMN_WIDTHS[col] ?? 120 },
                    fields: 'pixelSize',
                },
            });

        // Zwijane pozycje pod fakturą (+/- z lewej strony arkusza)
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

        // Kolorowanie kolumny „Status" (indeks 3)
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
                                    startColumnIndex: STATUS_COLUMN,
                                    endColumnIndex: STATUS_COLUMN + 1,
                                },
                            ],
                            booleanRule: {
                                condition: {
                                    type: 'TEXT_CONTAINS',
                                    values: [
                                        { userEnteredValue: rule.contains },
                                    ],
                                },
                                format: { backgroundColor: rule.color },
                            },
                        },
                    },
                });

        await ToolsSheets.batchUpdateSheet(auth, requests, gdId);
    }
}

/**
 * Pozycje pod id faktury. Repozytorium zwraca je płasko i posortowane malejąco po Id,
 * więc kolejność w obrębie faktury odwracamy — w arkuszu mają iść tak jak na fakturze.
 */
function groupItemsByInvoiceId(
    items: InvoiceItem[]
): Map<number, InvoiceItem[]> {
    const byInvoiceId = new Map<number, InvoiceItem[]>();
    for (const item of items) {
        const invoiceId = item._parent?.id ?? item.parentId;
        if (!invoiceId) continue;
        const bucket = byInvoiceId.get(invoiceId);
        if (bucket) bucket.push(item);
        else byInvoiceId.set(invoiceId, [item]);
    }
    for (const bucket of byInvoiceId.values()) bucket.reverse();
    return byInvoiceId;
}

/** Walidacja wejścia w Controllerze — Router zostaje cienki. */
function parseContractId(body: unknown): number {
    const raw = (body as any)?.contractId;
    const contractId = Number(raw);
    if (!Number.isInteger(contractId) || contractId <= 0)
        throw new Error('Nieprawidłowe contractId');
    return contractId;
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
