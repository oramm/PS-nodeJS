import Setup from '../../setup/Setup';
// import type: ContractTypes ciągnie za sobą modele (a te kontrolery i pulę DB) —
// builder ma zostać czysty i testowalny bez uruchamiania całego grafu aplikacji.
import type { ContractsWithChildren } from '../ContractTypes';
import {
    CaseListMatrix,
    CaseListSheetFilter,
    HyperlinkRow,
    LevelRun,
    RowGroup,
    SHEET_LEVELS,
    SheetLevel,
} from './CaseListSheetTypes';

/**
 * Buduje macierz arkusza „Spis spraw" z drzewa kontraktu (albo wszystkich kontraktów
 * projektu). Czysta transformacja danych — bez Google API i bez bazy, dzięki czemu daje
 * się testować bez auth. I/O robi CaseListSheetController.
 */

/** Wcięcie niełamliwymi spacjami — zwykłe wiodące spacje potrafi zjeść USER_ENTERED. */
const INDENT = '    ';

const BASE_HEADER = ['Poziom', 'Nazwa', 'Status', 'Uwagi'];
const OWNER_HEADER = 'Osoba';

/** Wiersz tytułu, wiersz opisu konfiguracji, pusty odstęp, wiersz nagłówków kolumn. */
export const HEADER_ROW_INDEX = 3;

/** Spis jednego kontraktu — kontrakt jest w tytule, drzewo zaczyna się od kamieni. */
export function buildCaseListMatrix(
    contractWithChildren: ContractsWithChildren,
    params: CaseListSheetFilter,
    context: { generatedAt: Date; personLabels: string[] }
): CaseListMatrix {
    return buildMatrix(
        {
            title: `Spis spraw - ${buildContractLabel(
                contractWithChildren.contract
            )}`,
            titleFolderUrl: resolveFolderUrl(contractWithChildren.contract),
            contractsWithChildren: [contractWithChildren],
            withContractRows: false,
        },
        params,
        context
    );
}

/**
 * Spis całego projektu — wszystkie jego kontrakty w jednym arkuszu. Kontrakt dostaje
 * własny wiersz (poziom „Kontrakt"), a jego drzewo schodzi o jedno wcięcie niżej.
 */
export function buildProjectCaseListMatrix(
    contractsWithChildren: ContractsWithChildren[],
    params: CaseListSheetFilter,
    context: {
        generatedAt: Date;
        personLabels: string[];
        projectLabel: string;
        projectFolderUrl?: string;
    }
): CaseListMatrix {
    return buildMatrix(
        {
            title: `Spis spraw - ${context.projectLabel}`,
            titleFolderUrl: context.projectFolderUrl,
            contractsWithChildren,
            withContractRows: true,
        },
        params,
        context
    );
}

type MatrixSource = {
    title: string;
    titleFolderUrl?: string;
    contractsWithChildren: ContractsWithChildren[];
    withContractRows: boolean;
};

function buildMatrix(
    source: MatrixSource,
    params: CaseListSheetFilter,
    context: { generatedAt: Date; personLabels: string[] }
): CaseListMatrix {
    const activeOnly = !params.includeFinished;
    // Kolumna „Osoba" ma sens dopiero przy kilku osobach — przy jednej wszędzie byłaby
    // ta sama wartość, więc osoba trafia do nazwy pliku (patrz buildCaseListFileName).
    const withOwnerColumn = params.personIds.length > 1;
    const header = withOwnerColumn
        ? [...BASE_HEADER, OWNER_HEADER]
        : [...BASE_HEADER];

    const rows: any[][] = [];
    const groups: RowGroup[] = [];
    // Hiperłącza do folderów na GD — zakładane osobnym żądaniem przez Controller.
    const linkRows: HyperlinkRow[] = [];

    rows.push([source.title]);
    if (source.titleFolderUrl)
        linkRows.push({
            rowIndex: 0,
            columnIndex: 0,
            startIndex: 0,
            url: source.titleFolderUrl,
        });
    rows.push([buildConfigLabel(params, context)]);
    rows.push(['']);
    rows.push(header);

    // Poziom każdego wiersza — wiersze nagłówkowe nie mają poziomu.
    const rowLevels: (SheetLevel | null)[] = [null, null, null, null];

    /** Dopisuje wiersz razem z jego poziomem, żeby oba ciągi nie mogły się rozjechać. */
    function emit(
        level: SheetLevel,
        depth: number,
        name: string,
        options: {
            status?: string;
            description?: string;
            owner?: string;
            folderUrl?: string;
        }
    ) {
        const rowIndex = rows.length;
        rows.push(makeRow(level, depth, name, { ...options, withOwnerColumn }));
        rowLevels.push(level);
        // Link zaczyna się za wcięciem, żeby podkreślenie nie ciągnęło się przez puste
        // znaki na początku komórki.
        if (options.folderUrl)
            linkRows.push({
                rowIndex,
                columnIndex: 1,
                startIndex: indentOf(depth).length,
                url: options.folderUrl,
            });
    }

    // Czy jakiś kontrakt już wylądował w arkuszu — po tym poznajemy, że kolejny
    // potrzebuje odstępu (licznik pętli by nie wystarczył: archiwalne wypadają).
    let anyContractEmitted = false;

    for (const contractWithChildren of source.contractsWithChildren) {
        const contract: any = contractWithChildren.contract;
        // Archiwalne kontrakty wycinamy tylko w spisie projektu — spis pojedynczego
        // kontraktu robi się świadomie na konkretnym kontrakcie, więc go nie ukrywamy.
        if (
            source.withContractRows &&
            activeOnly &&
            isArchivalContract(contract)
        )
            continue;

        // Wiersz kontraktu tylko w spisie projektu — resztę drzewa spycha o wcięcie niżej.
        const depthOffset = source.withContractRows ? 1 : 0;
        if (source.withContractRows) {
            // Pusty wiersz oddziela kontrakty. Poziom `null` trzyma go poza
            // formatowaniem i poza grupami, więc zostaje widoczny także po zwinięciu
            // drzewa poprzedniego kontraktu.
            if (anyContractEmitted) {
                rows.push(['']);
                rowLevels.push(null);
            }
            emit(SHEET_LEVELS.CONTRACT, 0, buildContractLabel(contract), {
                status: contract.status,
                description: contract.comment,
                folderUrl: resolveFolderUrl(contract),
            });
            anyContractEmitted = true;
        }
        const contractChildrenStart = rows.length;

        for (const { milestone, casesWithTasks } of contractWithChildren
            .milestonesWithCases ?? []) {
            if (activeOnly && isFinishedMilestone(milestone)) continue;

            emit(
                SHEET_LEVELS.MILESTONE,
                depthOffset,
                buildMilestoneLabel(milestone),
                {
                    status: milestone.status,
                    description: milestone.description,
                    folderUrl: resolveFolderUrl(milestone),
                }
            );
            const milestoneChildrenStart = rows.length;

            for (const caseWithTasks of casesWithTasks ?? []) {
                const caseItem: any = caseWithTasks.caseItem;
                if (activeOnly && isClosedCase(caseItem)) continue;

                emit(
                    SHEET_LEVELS.CASE,
                    depthOffset + 1,
                    buildCaseLabel(caseItem),
                    {
                        status: caseItem.status,
                        description: caseItem.description,
                        folderUrl: resolveFolderUrl(caseItem),
                    }
                );
                const caseChildrenStart = rows.length;

                pushTaskRows(
                    emit,
                    caseWithTasks.tasks,
                    depthOffset + 2,
                    params,
                    activeOnly
                );

                for (const subCaseWithTasks of caseWithTasks.subCasesWithTasks ??
                    []) {
                    const subCase: any = subCaseWithTasks.caseItem;
                    if (activeOnly && isClosedCase(subCase)) continue;

                    emit(
                        SHEET_LEVELS.SUBCASE,
                        depthOffset + 2,
                        buildCaseLabel(subCase),
                        {
                            status: subCase.status,
                            description: subCase.description,
                            folderUrl: resolveFolderUrl(subCase),
                        }
                    );
                    const subCaseChildrenStart = rows.length;

                    pushTaskRows(
                        emit,
                        subCaseWithTasks.tasks,
                        depthOffset + 3,
                        params,
                        activeOnly
                    );
                    pushGroup(groups, subCaseChildrenStart, rows.length);
                }

                pushGroup(groups, caseChildrenStart, rows.length);
            }

            pushGroup(groups, milestoneChildrenStart, rows.length);
        }

        if (source.withContractRows)
            pushGroup(groups, contractChildrenStart, rows.length);
    }

    return {
        values: rows,
        groups,
        levelRuns: collapseLevelRuns(rowLevels),
        headerRowIndex: HEADER_ROW_INDEX,
        colCount: header.length,
        linkRows,
    };
}

/**
 * Zwija poziomy kolejnych wierszy w ciągłe bloki — jedno żądanie formatowania na blok
 * zamiast jednego na wiersz (długi spis to inaczej setki żądań w batchu).
 */
export function collapseLevelRuns(
    rowLevels: (SheetLevel | null)[]
): LevelRun[] {
    const runs: LevelRun[] = [];
    for (let row = 0; row < rowLevels.length; row++) {
        const level = rowLevels[row];
        if (!level) continue;

        const last = runs[runs.length - 1];
        if (last && last.level === level && last.endRow === row)
            last.endRow = row + 1;
        else runs.push({ level, startRow: row, endRow: row + 1 });
    }
    return runs;
}

/**
 * Nazwa pliku koduje konfigurację — to po niej odnajdujemy arkusz do nadpisania.
 * Inna konfiguracja => inna nazwa => nowy plik obok, poprzednie zostają nietknięte.
 * Data generowania celowo NIE wchodzi do nazwy (rozbiłaby nadpisywanie) — jest w arkuszu.
 */
export function buildCaseListFileName(
    params: CaseListSheetFilter,
    personLabels: string[]
): string {
    const statusSegment = params.includeFinished
        ? 'wszystkie statusy'
        : 'aktywne';
    return ['Spis spraw', statusSegment, buildPersonSegment(personLabels)]
        .filter(Boolean)
        .join(' - ');
}

/**
 * Człon nazwy pliku z osobami — imiona i nazwiska, posortowane wg nazwiska.
 *
 * Nazwa pliku wyznacza tożsamość arkusza do nadpisania, więc musi być funkcją samego
 * ZBIORU osób. Stąd dwie decyzje:
 * - sortowanie: kolejność klikania w oknie nie może rozbić tej samej konfiguracji
 *   na dwa pliki z dwoma linkami;
 * - pełne imiona zamiast samych nazwisk: przy dwóch osobach o tym samym nazwisku
 *   różne zestawy dawałyby identyczną nazwę i jeden spis nadpisałby drugi.
 */
function buildPersonSegment(personLabels: string[]): string {
    if (personLabels.length === 0) return '';
    return [...personLabels]
        .sort((a, b) => lastNameOf(a).localeCompare(lastNameOf(b), 'pl'))
        .join(', ');
}

function lastNameOf(fullName: string): string {
    const parts = fullName.trim().split(/\s+/);
    return parts.length > 1 ? parts.slice(1).join(' ') : fullName.trim();
}

function buildConfigLabel(
    params: CaseListSheetFilter,
    context: { generatedAt: Date; personLabels: string[] }
): string {
    const parts = [
        `Wygenerowano: ${formatStamp(context.generatedAt)}`,
        `Statusy: ${
            params.includeFinished
                ? 'wszystkie'
                : 'bez zakończonych i archiwalnych'
        }`,
        `Osoby: ${
            context.personLabels.length
                ? context.personLabels.join(', ')
                : 'cały kontrakt'
        }`,
    ];
    return parts.join(' | ');
}

function formatStamp(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
        ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
}

type RowEmitter = (
    level: SheetLevel,
    depth: number,
    name: string,
    options: { status?: string; description?: string; owner?: string }
) => void;

function pushTaskRows(
    emit: RowEmitter,
    tasks: any[] | undefined,
    depth: number,
    params: CaseListSheetFilter,
    activeOnly: boolean
): void {
    for (const task of tasks ?? []) {
        if (activeOnly && task.status === Setup.TaskStatus.DONE) continue;
        if (!taskMatchesPersonFilter(task, params.personIds)) continue;

        emit(SHEET_LEVELS.TASK, depth, task.name ?? '', {
            status: task.status,
            description: task.description,
            owner: buildPersonLabel(task._owner),
        });
    }
}

/**
 * Zadania nieprzypisane pokazujemy ZAWSZE — także przy filtrze osób. To rzeczy
 * czekające na przypisanie i nie powinny umknąć osobie robiącej spis pod siebie.
 */
function taskMatchesPersonFilter(task: any, personIds: number[]): boolean {
    if (!personIds.length) return true;
    if (task.ownerId === null || task.ownerId === undefined) return true;
    return personIds.includes(task.ownerId);
}

function makeRow(
    level: string,
    depth: number,
    name: string,
    options: {
        status?: string;
        description?: string;
        withOwnerColumn: boolean;
        owner?: string;
    }
): any[] {
    const row = [
        level,
        indentOf(depth) + name,
        options.status ?? '',
        options.description ?? '',
    ];
    if (options.withOwnerColumn) row.push(options.owner ?? '');
    return row;
}

function indentOf(depth: number): string {
    return INDENT.repeat(depth);
}

/** Grupa musi obejmować co najmniej jeden wiersz — puste gałęzie pomijamy. */
function pushGroup(groups: RowGroup[], startRow: number, endRow: number): void {
    if (endRow > startRow) groups.push({ startRow, endRow });
}

export function buildPersonLabel(person: any): string {
    if (!person) return '';
    return `${person.name ?? ''} ${person.surname ?? ''}`.trim();
}

/** Etykieta kontraktu jak w drzewie: ourId/numer, alias, nazwa. */
export function buildContractLabel(contract: any): string {
    const identifier = contract.ourId ?? contract.number ?? '';
    return [identifier, contract.alias, contract.name]
        .filter(Boolean)
        .join(' | ');
}

/** Etykieta projektu w tytule spisu: ourId, alias, nazwa. */
export function buildProjectLabel(project: any): string {
    return [project.ourId, project.alias, project.name]
        .filter(Boolean)
        .join(' | ');
}

/** Nazwa kamienia jak w drzewie — sama .name bywa pusta. */
function buildMilestoneLabel(milestone: any): string {
    return [milestone._type?._folderNumber, milestone._type?.name, milestone.name]
        .filter(Boolean)
        .join(' ')
        .trim();
}

/** Nazwa sprawy jak w drzewie — sama .name bywa pusta. */
function buildCaseLabel(caseItem: any): string {
    return [caseItem._type?.name, caseItem.number, caseItem.name]
        .filter(Boolean)
        .join(' ')
        .trim();
}

/**
 * Adres folderu na GD — gotowy `_gdFolderUrl` z drzewa, a gdy go nie ma, składany
 * z `gdFolderId`. Brak obu = wiersz bez linku (np. sprawa jeszcze bez folderu).
 */
function resolveFolderUrl(entity: any): string | undefined {
    if (!entity) return undefined;
    if (entity._gdFolderUrl) return entity._gdFolderUrl;
    if (entity.gdFolderId)
        return `https://drive.google.com/drive/folders/${entity.gdFolderId}`;
    return undefined;
}

function isArchivalContract(contract: any): boolean {
    return contract.status === Setup.ContractStatus.ARCHIVAL;
}

function isFinishedMilestone(milestone: any): boolean {
    return (
        milestone.status === Setup.MilestoneStatus.FINISHED ||
        milestone.status === Setup.MilestoneStatus.ARCHIVAL
    );
}

function isClosedCase(caseItem: any): boolean {
    return caseItem.status === Setup.CaseStatus.CLOSED;
}
