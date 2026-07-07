import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import BaseController from '../../controllers/BaseController';
import Setup from '../../setup/Setup';
import ToolsSheets from '../../tools/ToolsSheets';
import ToolsDate from '../../tools/ToolsDate';
import ContractsWithChildrenController from '../../contracts/ContractsWithChildrenController';
import ScrumboardContractStatus from '../contractStatuses/ScrumboardContractStatus';
import ScrumboardContractStatusRepository from '../contractStatuses/ScrumboardContractStatusRepository';
import ScrumboardContractStatusesController from '../contractStatuses/ScrumboardContractStatusesController';
import ScrumboardSummaryController from '../summary/ScrumboardSummaryController';
import { getScrumWeekNumber } from '../ScrumboardWeek';

export interface ScrumboardReportResult {
    gdId: string;
    url: string;
    name: string;
}

/**
 * Generuje kopię-migawkę scrumboarda jako NOWY arkusz Google w folderze raportów.
 * Nie usuwa wcześniejszych kopii. Dane pobierane z bazy (nie z arkusza ScrumSheet).
 */
export default class ScrumboardReportController extends BaseController<
    ScrumboardContractStatus,
    ScrumboardContractStatusRepository
> {
    private static instance: ScrumboardReportController;

    constructor() {
        super(new ScrumboardContractStatusRepository());
    }

    private static getInstance(): ScrumboardReportController {
        if (!this.instance) this.instance = new ScrumboardReportController();
        return this.instance;
    }

    static async generate(
        auth?: OAuth2Client
    ): Promise<ScrumboardReportResult> {
        return this.withAuth<ScrumboardReportResult>(
            (instance: ScrumboardReportController, authClient: OAuth2Client) =>
                instance.generateReport(authClient),
            auth
        );
    }

    private async generateReport(
        auth: OAuth2Client
    ): Promise<ScrumboardReportResult> {
        const now = new Date();
        const weekNumber = getScrumWeekNumber(now);
        const stamp = `${ToolsDate.dateJsToSql(now)} ${String(
            now.getHours()
        ).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const name = `${weekNumber}. ENVI scrumboard ${stamp}`;

        // 1. Utwórz nowy arkusz w folderze raportów (nie usuwając istniejących)
        const drive = google.drive({ version: 'v3', auth });
        const created = await drive.files.create({
            requestBody: {
                name,
                mimeType: 'application/vnd.google-apps.spreadsheet',
                parents: [Setup.ScrumBoard.reportFolderId],
            },
            fields: 'id',
        });
        const gdId = created.data.id as string;

        // 2. Zbuduj dane z bazy (tabela zadań + blok podsumowania obok, jak w arkuszu)
        const [contractsWithChildren, statuses, summary] = await Promise.all([
            ContractsWithChildrenController.find([{ statusType: 'active' }]),
            ScrumboardContractStatusesController.find(),
            ScrumboardSummaryController.getSummary(),
        ]);
        const discussedByContractId = new Map(
            statuses.map((s) => [s.contractId, s.discussed])
        );
        const enviContracts = contractsWithChildren.filter(
            (cwc) =>
                (cwc.contract as any).ourId &&
                cwc.contract.status === Setup.ContractStatus.IN_PROGRESS
        );

        const task = ScrumboardReportController.buildTaskMatrix(
            enviContracts,
            discussedByContractId
        );
        const summaryValues =
            ScrumboardReportController.buildSummaryMatrix(summary);

        // 3. Zapis: tabela zadań od A1, podsumowanie w kolumnach na prawo (jak w oryginale)
        const summaryStartCol = task.colCount + 1; // 1 kolumna odstępu
        const spreadsheet = await ToolsSheets.getSpreadSheet(auth, gdId);
        const props = spreadsheet.data.sheets?.[0]?.properties;
        const firstSheetTitle = props?.title ?? 'Sheet1';
        const sheetId = props?.sheetId ?? 0;

        await ToolsSheets.updateValues(auth, {
            spreadsheetId: gdId,
            rangeA1: `${firstSheetTitle}!A1`,
            values: task.values,
        });
        await ToolsSheets.updateValues(auth, {
            spreadsheetId: gdId,
            rangeA1: `${firstSheetTitle}!${colLetter(summaryStartCol)}1`,
            values: summaryValues,
        });

        // 4. Formatowanie: pogrubione nagłówki na szarym tle + auto-szerokość kolumn (bez ucinania)
        await ScrumboardReportController.applyFormatting(auth, gdId, {
            sheetId,
            taskColCount: task.colCount,
            taskHeaderRows: task.headerRowIndices,
            taskRowCount: task.values.length,
            summaryStartCol,
            summaryColCount: 11,
            lastCol: summaryStartCol + 11,
        });

        return {
            gdId,
            url: `https://docs.google.com/spreadsheets/d/${gdId}`,
            name,
        };
    }

    private static readonly TASK_HEADER = [
        'Kamień milowy',
        'Sprawa',
        'Zadanie',
        'Deadline',
        'szac. czas',
        'Status',
        'Kto',
        'PON.',
        'WTO.',
        'ŚR.',
        'CZW.',
        'PT.',
        'Razem',
    ];

    /** Tabela zadań (lewa strona). Zwraca wartości, indeksy wierszy-nagłówków i liczbę kolumn. */
    private static buildTaskMatrix(
        enviContracts: any[],
        discussedByContractId: Map<number, boolean>
    ): { values: any[][]; headerRowIndices: number[]; colCount: number } {
        const rows: any[][] = [];
        const headerRowIndices: number[] = [];

        for (const cwc of enviContracts) {
            const contract: any = cwc.contract;
            const coordinator = contract._manager
                ? `${contract._manager.name ?? ''} ${
                      contract._manager.surname ?? ''
                  }`.trim()
                : '';
            headerRowIndices.push(rows.length);
            rows.push([
                `${contract.ourId ?? ''}${
                    contract.alias ? ' | ' + contract.alias : ''
                }`,
                contract.name ?? '',
                '',
                'Koordynator:',
                coordinator,
                'Omówiony:',
                discussedByContractId.get(contract.id) ? 'TAK' : 'nie',
            ]);
            headerRowIndices.push(rows.length);
            rows.push([...ScrumboardReportController.TASK_HEADER]);

            for (const mwc of cwc.milestonesWithCases) {
                // Nazwa kamienia jak w drzewie: numer typu + typ + własna nazwa (często sama .name jest pusta)
                const m: any = mwc.milestone;
                const milestoneLabel = [
                    m._type?._folderNumber,
                    m._type?.name,
                    m.name,
                ]
                    .filter(Boolean)
                    .join(' ')
                    .trim();
                for (const cwt of mwc.casesWithTasks) {
                    ScrumboardReportController.pushCaseTaskRows(
                        rows,
                        milestoneLabel,
                        cwt
                    );
                    for (const subCwt of cwt.subCasesWithTasks ?? [])
                        ScrumboardReportController.pushCaseTaskRows(
                            rows,
                            milestoneLabel,
                            subCwt
                        );
                }
            }
            rows.push([]);
        }

        return {
            values: rows,
            headerRowIndices,
            colCount: ScrumboardReportController.TASK_HEADER.length,
        };
    }

    /** Blok podsumowania godzin (prawa strona). */
    private static buildSummaryMatrix(summary: any[]): any[][] {
        const rows: any[][] = [
            [
                'Osoba',
                'Dostępne',
                'Przypisano',
                'PON.',
                'WTO.',
                'ŚR.',
                'CZW.',
                'PT.',
                'Spotkania',
                'Razem',
                'Pozostało',
            ],
        ];
        for (const s of summary)
            rows.push([
                s.personName,
                s.available,
                s.assigned,
                s.mon,
                s.tue,
                s.wed,
                s.thu,
                s.fri,
                s.meetings,
                s.total,
                s.remaining,
            ]);
        return rows;
    }

    private static async applyFormatting(
        auth: OAuth2Client,
        gdId: string,
        params: {
            sheetId: number;
            taskColCount: number;
            taskHeaderRows: number[];
            taskRowCount: number;
            summaryStartCol: number;
            summaryColCount: number;
            lastCol: number;
        }
    ): Promise<void> {
        const headerFormat = {
            userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
            },
        };
        const requests: any[] = [];
        // Pogrubione nagłówki tabeli zadań
        for (const r of params.taskHeaderRows)
            requests.push({
                repeatCell: {
                    range: {
                        sheetId: params.sheetId,
                        startRowIndex: r,
                        endRowIndex: r + 1,
                        startColumnIndex: 0,
                        endColumnIndex: params.taskColCount,
                    },
                    cell: headerFormat,
                    fields: 'userEnteredFormat(textFormat,backgroundColor)',
                },
            });
        // Pogrubiony nagłówek podsumowania
        requests.push({
            repeatCell: {
                range: {
                    sheetId: params.sheetId,
                    startRowIndex: 0,
                    endRowIndex: 1,
                    startColumnIndex: params.summaryStartCol,
                    endColumnIndex: params.summaryStartCol + params.summaryColCount,
                },
                cell: headerFormat,
                fields: 'userEnteredFormat(textFormat,backgroundColor)',
            },
        });
        // Auto-szerokość kolumn — treść się nie ucina
        requests.push({
            autoResizeDimensions: {
                dimensions: {
                    sheetId: params.sheetId,
                    dimension: 'COLUMNS',
                    startIndex: 0,
                    endIndex: params.lastCol,
                },
            },
        });
        // Kolumny B (nazwy kontraktów/spraw) i C (nazwy zadań): stała szerokość + zawijanie
        requests.push({
            updateDimensionProperties: {
                range: {
                    sheetId: params.sheetId,
                    dimension: 'COLUMNS',
                    startIndex: 1,
                    endIndex: 2,
                },
                properties: { pixelSize: 700 },
                fields: 'pixelSize',
            },
        });
        requests.push({
            updateDimensionProperties: {
                range: {
                    sheetId: params.sheetId,
                    dimension: 'COLUMNS',
                    startIndex: 2,
                    endIndex: 3,
                },
                properties: { pixelSize: 500 },
                fields: 'pixelSize',
            },
        });
        requests.push({
            repeatCell: {
                range: {
                    sheetId: params.sheetId,
                    startRowIndex: 0,
                    endRowIndex: params.taskRowCount,
                    startColumnIndex: 1,
                    endColumnIndex: 3,
                },
                cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } },
                fields: 'userEnteredFormat.wrapStrategy',
            },
        });
        // Kolorowanie statusów wg reguł z dotychczasowego arkusza (kolumna Status = indeks 5)
        const STATUS_COLORS: { contains: string; color: any }[] = [
            { contains: 'Rozpocz', color: { red: 0.85, green: 0.85, blue: 0.85 } },
            { contains: 'trak', color: { red: 1, green: 0.85, blue: 0.4 } },
            { contains: 'popra', color: { red: 1, green: 0.8, blue: 0.35 } },
            { contains: 'zrob', color: { red: 0.5, green: 0.78, blue: 0.5 } },
            { contains: 'oczekiwa', color: { red: 0.72, green: 0.88, blue: 0.72 } },
        ];
        for (const rule of STATUS_COLORS)
            requests.push({
                addConditionalFormatRule: {
                    index: 0,
                    rule: {
                        ranges: [
                            {
                                sheetId: params.sheetId,
                                startRowIndex: 0,
                                endRowIndex: params.taskRowCount,
                                startColumnIndex: 5,
                                endColumnIndex: 6,
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

    private static pushCaseTaskRows(
        rows: any[][],
        milestoneName: string,
        caseWithTasks: any
    ): void {
        // Nazwa sprawy jak w drzewie: typ + numer + własna nazwa (często sama .name jest pusta)
        const c: any = caseWithTasks.caseItem;
        const caseName = [c?._type?.name, c?.number, c?.name]
            .filter(Boolean)
            .join(' ')
            .trim();
        for (const task of caseWithTasks.tasks ?? []) {
            // te same statusy co w dawnym scrumboardzie (pomijamy Backlog)
            if (task.status === Setup.TaskStatus.BACKLOG) continue;
            const owner = task._owner
                ? `${task._owner.name ?? ''} ${task._owner.surname ?? ''}`.trim()
                : '';
            const days = [
                task.hoursMon,
                task.hoursTue,
                task.hoursWed,
                task.hoursThu,
                task.hoursFri,
            ].map((h: number | null | undefined) => h ?? '');
            const weekSum = [
                task.hoursMon,
                task.hoursTue,
                task.hoursWed,
                task.hoursThu,
                task.hoursFri,
            ].reduce((sum: number, h: number | null | undefined) => sum + (h ?? 0), 0);
            rows.push([
                milestoneName,
                caseName,
                task.name ?? '',
                task.deadline ?? '',
                task.estimatedHours ?? '',
                task.status ?? '',
                owner,
                ...days,
                weekSum,
            ]);
        }
    }
}

/** Indeks kolumny (0-based) → litera(y) A1 (0→A, 15→P, 26→AA). */
function colLetter(index: number): string {
    let s = '';
    let n = index;
    do {
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return s;
}
