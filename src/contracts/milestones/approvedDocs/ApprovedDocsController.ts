import { OAuth2Client } from 'google-auth-library';
import Setup from '../../../setup/Setup';
import ToolsGd from '../../../tools/ToolsGd';
import ToolsSheets from '../../../tools/ToolsSheets';
import type Milestone from '../Milestone';
import type Letter from '../../../letters/Letter';
import type { CaseData } from '../../../types/types';

const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet';
// Indeksy kolumn (0-based) zgodne z Setup.ApprovedDocumentation.header
const COL = { LP: 0, DATA: 1, RODZAJ: 2, NR: 3, DOTYCZY: 4, SPRAWA: 5, LINK: 6 };
const GRID_BORDER = { style: 'SOLID', color: { red: 0.7, green: 0.7, blue: 0.7 } };

/**
 * Rejestr „Dokumentacja zatwierdzona” dla kamieni typu projektowanie-nadzór.
 * Zwykła klasa ze statycznymi metodami przyjmującymi już rozwiązany `auth`.
 * Operacje idempotentne (get-or-create).
 */
export default class ApprovedDocsController {
    /** Czy dla danego kamienia rejestr ma być prowadzony (typ 6 + flaga kontraktu). */
    static isApplicable(milestone: Milestone): boolean {
        return (
            milestone.typeId === Setup.MilestoneTypes.DESIGN_SUPERVISION &&
            milestone._contract?.approvedDocumentation === true
        );
    }

    /** Reguła walidacji kolumny „Rodzaj”: podpowiedzi pismo/mail, ale można wpisać inne. */
    private static rodzajValidationRule() {
        return {
            condition: {
                type: 'ONE_OF_LIST',
                values: Setup.ApprovedDocumentation.rodzajOptions.map((v) => ({
                    userEnteredValue: v,
                })),
            },
            showCustomUi: true,
            strict: false,
        };
    }

    /** Zapewnia folder „04 Dokumentacja zatwierdzona” i arkusz-rejestr w kamieniu. */
    static async ensureFolderAndSheet(
        auth: OAuth2Client,
        milestone: Milestone
    ): Promise<{
        folderId: string;
        spreadsheetId: string;
        sheetTabName: string;
        sheetId: number;
    }> {
        if (milestone.typeId !== Setup.MilestoneTypes.DESIGN_SUPERVISION)
            throw new Error(
                'ApprovedDocs: kamień nie jest typu projektowanie-nadzór'
            );
        if (!milestone.gdFolderId)
            throw new Error('ApprovedDocs: kamień nie ma folderu GD');

        const { folderName, sheetName, header } = Setup.ApprovedDocumentation;

        const folder = await ToolsGd.setFolder(auth, {
            parentId: milestone.gdFolderId,
            name: folderName,
        });
        const folderId = folder.id as string;

        let sheet = await ToolsGd.getFileMetaDataByNameAndMimeType(auth, {
            parentId: folderId,
            fileName: sheetName,
            mimeType: SPREADSHEET_MIME,
        });
        const created = !sheet;
        if (!sheet) {
            sheet = await ToolsGd.createNativeFile(auth, {
                name: sheetName,
                parentId: folderId,
                mimeType: SPREADSHEET_MIME,
            });
        }
        const spreadsheetId = sheet.id as string;

        const meta = await ToolsSheets.getSpreadSheet(auth, spreadsheetId);
        const props = meta.data.sheets?.[0]?.properties;
        const sheetTabName = props?.title ?? 'Arkusz1';
        const sheetId = props?.sheetId ?? 0;

        if (created) {
            await ToolsSheets.updateValues(auth, {
                spreadsheetId,
                rangeA1: 'A1',
                values: [header],
            });
            await this.formatSheet(auth, spreadsheetId, sheetId);
        }

        return { folderId, spreadsheetId, sheetTabName, sheetId };
    }

    /** Rejestruje pismo: skrót w folderze „04” + wiersz w arkuszu (bez dublowania). */
    static async registerLetter(
        auth: OAuth2Client,
        milestone: Milestone,
        letter: Letter
    ): Promise<void> {
        const { folderId, spreadsheetId, sheetTabName, sheetId } =
            await this.ensureFolderAndSheet(auth, milestone);

        const targetId = letter.gdDocumentId || letter.gdFolderId;
        if (!targetId)
            throw new Error('ApprovedDocs: pismo nie ma dokumentu ani folderu GD');

        // Idempotencja po numerze pisma (kolumna „Nr pisma zatwierdzającego”).
        const existing = await ToolsSheets.getValues(auth, {
            spreadsheetId,
            rangeA1: sheetTabName,
        });
        const rows = (existing.values ?? []) as any[][];
        const letterNo = String(letter.number ?? '').trim();
        if (
            letterNo &&
            rows.some((row) => String(row?.[COL.NR] ?? '').trim() === letterNo)
        ) {
            console.log(
                `ApprovedDocs: pismo ${letter.number} już jest w rejestrze — pomijam`
            );
            return;
        }

        await ToolsGd.createShortcut(auth, {
            targetId,
            parentId: folderId,
            name: `${letter.number} ${letter.description ?? ''}`.trim(),
        });

        // Wiersz: Lp | Data | Rodzaj | Nr pisma | Dotyczy | Sprawa | Link
        const lp = rows.length; // nagłówek + istniejące wiersze → kolejne Lp
        const date = (letter.creationDate ?? '').toString().slice(0, 10);
        const docUrl = letter.gdDocumentId
            ? ToolsGd.createDocumentOpenUrl(letter.gdDocumentId)
            : ToolsGd.createGdFolderUrl(letter.gdFolderId as string);
        const { text: sprawaText, runs } = buildSprawaRichText(letter._cases);

        const appendRes = await ToolsSheets.appendRowsToSpreadSheet(auth, {
            spreadsheetId,
            sheetName: sheetTabName,
            values: [
                [
                    lp,
                    date,
                    'pismo',
                    letter.number,
                    letter.description ?? '',
                    sprawaText,
                    docUrl,
                ],
            ],
        });

        // Rich-text hiperłącza spraw w komórce „Sprawa” dopisanego wiersza + krawędzie.
        const updatedRange = (appendRes as any)?.data?.updates?.updatedRange as
            | string
            | undefined;
        const rowNumber = Number(updatedRange?.match(/(\d+)(?::|$)/)?.[1]);
        if (Number.isFinite(rowNumber)) {
            const requests: any[] = [
                // append (INSERT_ROWS) dziedziczy format wiersza wyżej (nagłówek jest
                // pogrubiony) — wymuszamy nie-pogrubione, wyśrodkowane wartości.
                {
                    repeatCell: {
                        range: {
                            sheetId,
                            startRowIndex: rowNumber - 1,
                            endRowIndex: rowNumber,
                            startColumnIndex: 0,
                            endColumnIndex: Setup.ApprovedDocumentation.header.length,
                        },
                        cell: {
                            userEnteredFormat: {
                                textFormat: { bold: false },
                                horizontalAlignment: 'CENTER',
                                verticalAlignment: 'MIDDLE',
                            },
                        },
                        fields: 'userEnteredFormat(textFormat,horizontalAlignment,verticalAlignment)',
                    },
                },
                // wstawiony wiersz (INSERT_ROWS) nie dziedziczy walidacji — ustaw dropdown
                // „Rodzaj” jawnie, żeby pierwszy rekord też miał listę.
                {
                    setDataValidation: {
                        range: {
                            sheetId,
                            startRowIndex: rowNumber - 1,
                            endRowIndex: rowNumber,
                            startColumnIndex: COL.RODZAJ,
                            endColumnIndex: COL.RODZAJ + 1,
                        },
                        rule: ApprovedDocsController.rodzajValidationRule(),
                    },
                },
                {
                    updateCells: {
                        rows: [
                            {
                                values: [
                                    // Sprawa: etykiety + hiperłącza per sprawa
                                    {
                                        userEnteredValue: { stringValue: sprawaText },
                                        textFormatRuns: runs,
                                    },
                                    // Link: jawny hiperłącze (per-wiersz format zdejmuje
                                    // auto-linkowanie surowego URL, więc linkujemy sami)
                                    {
                                        userEnteredValue: { stringValue: docUrl ?? '' },
                                        textFormatRuns: docUrl
                                            ? [{ startIndex: 0, format: { link: { uri: docUrl } } }]
                                            : [],
                                    },
                                ],
                            },
                        ],
                        fields: 'userEnteredValue,textFormatRuns',
                        // Sprawa (F) i Link (G) są obok siebie — zapis obu jednym requestem.
                        start: {
                            sheetId,
                            rowIndex: rowNumber - 1,
                            columnIndex: COL.SPRAWA,
                        },
                    },
                },
            ];
            await ToolsSheets.batchUpdateSheet(auth, requests, spreadsheetId);
        }
    }

    /** Formatowanie arkusza (raz, przy tworzeniu): pogrubiony nagłówek (bez kolorów),
     *  krawędzie, zamrożony wiersz, filtr, szerokości i dropdown w „Rodzaj”. */
    private static async formatSheet(
        auth: OAuth2Client,
        spreadsheetId: string,
        sheetId: number
    ): Promise<void> {
        const headerLen = Setup.ApprovedDocumentation.header.length;
        const width = (i: number, px: number) => ({
            updateDimensionProperties: {
                range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
                properties: { pixelSize: px },
                fields: 'pixelSize',
            },
        });
        await ToolsSheets.batchUpdateSheet(
            auth,
            [
                // pogrubiony nagłówek (tylko nagłówek, bez tła)
                {
                    repeatCell: {
                        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
                        cell: { userEnteredFormat: { textFormat: { bold: true } } },
                        fields: 'userEnteredFormat.textFormat.bold',
                    },
                },
                // wyśrodkowanie całego obszaru (nagłówek + wiersze) — żeby wpisy
                // ręczne miały to samo formatowanie co dopisywane automatycznie
                {
                    repeatCell: {
                        range: {
                            sheetId,
                            startRowIndex: 0,
                            endRowIndex: 100,
                            startColumnIndex: 0,
                            endColumnIndex: headerLen,
                        },
                        cell: {
                            userEnteredFormat: {
                                horizontalAlignment: 'CENTER',
                                verticalAlignment: 'MIDDLE',
                            },
                        },
                        fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)',
                    },
                },
                // krawędzie komórek (szara siatka) — nagłówek + obszar wpisów
                {
                    repeatCell: {
                        range: {
                            sheetId,
                            startRowIndex: 0,
                            endRowIndex: 100,
                            startColumnIndex: 0,
                            endColumnIndex: headerLen,
                        },
                        cell: {
                            userEnteredFormat: {
                                borders: {
                                    top: GRID_BORDER,
                                    bottom: GRID_BORDER,
                                    left: GRID_BORDER,
                                    right: GRID_BORDER,
                                },
                            },
                        },
                        fields: 'userEnteredFormat.borders',
                    },
                },
                // zamrożony wiersz nagłówka
                {
                    updateSheetProperties: {
                        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
                        fields: 'gridProperties.frozenRowCount',
                    },
                },
                // filtr kolumn (lejki w nagłówku)
                {
                    setBasicFilter: {
                        filter: {
                            range: {
                                sheetId,
                                startRowIndex: 0,
                                startColumnIndex: 0,
                                endColumnIndex: headerLen,
                            },
                        },
                    },
                },
                // dropdown w „Rodzaj” — podpowiedzi pismo/mail, ale można wpisać inne
                {
                    setDataValidation: {
                        range: { sheetId, startRowIndex: 1, startColumnIndex: COL.RODZAJ, endColumnIndex: COL.RODZAJ + 1 },
                        rule: this.rodzajValidationRule(),
                    },
                },
                width(COL.LP, 45),
                width(COL.DATA, 100),
                width(COL.RODZAJ, 90),
                width(COL.NR, 200), 
                width(COL.DOTYCZY, 450), 
                width(COL.SPRAWA, 450), 
                width(COL.LINK, 450), 
            ],
            spreadsheetId
        );
    }
}

/** Etykieta sprawy do arkusza. */
function caseLabel(caseItem: CaseData): string {
    const c = caseItem as any;
    return (
        (c._typeFolderNumber_TypeName_Number_Name as string) ||
        (c.name as string) ||
        (c.number != null ? `Sprawa ${c.number}` : 'Sprawa')
    ).trim();
}

/** URL folderu sprawy. */
function caseUrl(caseItem: CaseData): string {
    const c = caseItem as any;
    return (
        (c._gdFolderUrl as string) ||
        (c.gdFolderId ? ToolsGd.createGdFolderUrl(c.gdFolderId) : '')
    );
}

/**
 * Tekst komórki „Sprawa” (etykiety po przecinku) + textFormatRuns z hiperłączem
 * per sprawa (natywny rich text Sheets — działa dla wielu spraw). Eksport dla testu.
 */
export function buildSprawaRichText(cases: CaseData[]): {
    text: string;
    runs: { startIndex: number; format: any }[];
} {
    let text = '';
    const runs: { startIndex: number; format: any }[] = [];
    (cases ?? []).forEach((caseItem, i) => {
        if (i > 0) {
            runs.push({ startIndex: text.length, format: {} }); // separator bez linku
            text += ', ';
        }
        const url = caseUrl(caseItem);
        runs.push({
            startIndex: text.length,
            format: url ? { link: { uri: url } } : {},
        });
        text += caseLabel(caseItem);
    });
    return { text, runs };
}
