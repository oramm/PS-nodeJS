/** Parametry generowania spisu spraw kontraktu (arkusz Google). */
export interface CaseListSheetParams {
    contractId: number;
    /** true = wszystkie statusy; false = bez zakończonych/archiwalnych (Backlog zostaje) */
    includeFinished: boolean;
    /** Pusta/pominięta = cały kontrakt. Jedna osoba => nazwisko w nazwie pliku zamiast kolumny. */
    personIds: number[];
}

export interface CaseListSheetResult {
    gdId: string;
    url: string;
    /** Nazwa pliku — koduje konfigurację, po niej odnajdujemy arkusz do nadpisania. */
    name: string;
    /** Czy nadpisano istniejący arkusz (false = utworzono nowy). */
    overwritten: boolean;
}

/** Poziom w drzewie — wartość kolumny „Poziom" i zarazem głębokość wcięcia nazwy. */
export const SHEET_LEVELS = {
    MILESTONE: 'Kamień',
    CASE: 'Sprawa',
    SUBCASE: 'Podsprawa',
    TASK: 'Zadanie',
} as const;

/** Zakres wierszy zwijanej gałęzi (indeksy 0-based, endRow wyłączny). */
export interface RowGroup {
    startRow: number;
    endRow: number;
}

/** Ciągły blok wierszy tego samego poziomu — jedno żądanie formatowania na blok. */
export interface LevelRun {
    level: SheetLevel;
    startRow: number;
    endRow: number;
}

/** Hiperłącze do folderu na GD wpięte w tekst komórki (indeksy 0-based). */
export interface HyperlinkRow {
    rowIndex: number;
    columnIndex: number;
    /** Znak, od którego zaczyna się link — pomija wcięcie, żeby nie było podkreślone. */
    startIndex: number;
    url: string;
}

export type SheetLevel = (typeof SHEET_LEVELS)[keyof typeof SHEET_LEVELS];

export interface CaseListMatrix {
    values: any[][];
    /** Grupy wierszy do zwijania (+/- z lewej strony arkusza). */
    groups: RowGroup[];
    /** Bloki wierszy wg poziomu — źródło formatowania różnicującego kamienie/sprawy/zadania. */
    levelRuns: LevelRun[];
    /** Indeks wiersza z nagłówkami kolumn (0-based). */
    headerRowIndex: number;
    /** Liczba kolumn (4 lub 5 — z kolumną „Osoba"). */
    colCount: number;
    /** Wiersze, którym Controller dokłada hiperłącza do folderów na GD. */
    linkRows: HyperlinkRow[];
}
