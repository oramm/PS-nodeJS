import type Invoice from '../Invoice';
import type InvoiceItem from '../InvoiceItem';

/**
 * Buduje macierz arkusza „Podsumowanie faktur" kontraktu. Czysta transformacja danych —
 * bez Google API i bez bazy, więc daje się testować bez auth. I/O robi Controller.
 */

/** Wcięcie niełamliwymi spacjami — zwykłe wiodące spacje potrafi zjeść USER_ENTERED. */
const INDENT = '    ';

const HEADER = [
    'Numer / poz.',
    'Sprzedaż',
    'Status',
    'Wysłano',
    'Termin płatności',
    'Ilość',
    'Cena jedn., zł',
    'Netto, zł',
    'Opis / uwagi',
];

/**
 * Kafelki rozliczenia z widoku kontraktu. Tooltipów w arkuszu nie ma, więc podstawa
 * wyliczenia (faktury wysłane vs zarejestrowane) wchodzi wprost do etykiety.
 */
const SETTLEMENT_LABELS = [
    'Wartość netto, zł',
    'Rozliczono, zł (faktury wysłane)',
    'Do rozliczenia, zł',
    'Zarejestrowano, zł (faktury zarejestrowane)',
    'Do zarejestrowania, zł',
];

/** Rozliczenie kontraktu liczone przez ContractsSettlementController. */
export interface ContractSettlementSums {
    value?: number;
    totalIssuedValue?: number;
    remainingIssuedValue?: number;
    totalRegisteredValue?: number;
    remainingRegisteredValue?: number;
}

/** Wiersz etykiet kafelków rozliczenia (0-based). */
export const SETTLEMENT_LABEL_ROW_INDEX = 3;
/** Wiersz wartości kafelków rozliczenia (0-based). */
export const SETTLEMENT_VALUE_ROW_INDEX = 4;
/** Liczba kolumn zajętych przez blok rozliczenia. */
export const SETTLEMENT_COL_COUNT = SETTLEMENT_LABELS.length;
/** Kolumna, od której zaczyna się blok rozliczenia (0-based). */
export const SETTLEMENT_START_COLUMN = 1;

/** Tytuł, data, odstęp, dwa wiersze rozliczenia, odstęp, wiersz nagłówków kolumn. */
export const HEADER_ROW_INDEX = 6;

export const SHEET_LEVELS = {
    INVOICE: 'Faktura',
    ITEM: 'Pozycja',
    TOTAL: 'Razem',
} as const;

export type SheetLevel = (typeof SHEET_LEVELS)[keyof typeof SHEET_LEVELS];

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

export interface InvoiceSummaryMatrix {
    values: any[][];
    /** Grupy wierszy do zwijania (+/- z lewej strony arkusza) — pozycje pod fakturą. */
    groups: RowGroup[];
    levelRuns: LevelRun[];
    colCount: number;
}

const SUMMARY_SHEET_NAME_BASE = 'Podsumowanie faktur';

/**
 * Nazwa pliku: „Podsumowanie faktur - <numer kontraktu> - <data>".
 *
 * Data jest częścią nazwy, ale NIE wyznacza tożsamości pliku: kontrakt ma jeden arkusz,
 * odnajdywany po prefiksie (patrz buildSummarySheetNamePrefix), a przy kolejnym
 * generowaniu Controller tylko zmienia mu nazwę na bieżącą datę. Dzięki temu raz wysłany
 * link działa dalej, a nazwa mówi, kiedy arkusz ostatnio odświeżono.
 */
export function buildSummarySheetFileName(
    contract: any,
    generatedAt: Date
): string {
    return buildSummarySheetNamePrefix(contract) + formatDate(generatedAt);
}

/**
 * Początek nazwy arkusza kontraktu — po nim odnajdujemy plik do nadpisania, niezależnie
 * od daty w jego nazwie. Kończy się separatorem, więc numer „U/1/2026" nie trafi
 * w arkusz kontraktu „U/1/2026A".
 *
 * Ukośniki w identyfikatorze zamieniamy na podkreślenia, żeby nie udawały ścieżki
 * i nie zlewały się z separatorem członów nazwy.
 */
export function buildSummarySheetNamePrefix(contract: any): string {
    const identifier = String(contract?.ourId ?? contract?.number ?? '')
        .replace(/[\\/]/g, '_')
        .trim();
    return [SUMMARY_SHEET_NAME_BASE, identifier].filter(Boolean).join(' - ') + ' - ';
}

export function buildInvoiceSummaryMatrix(
    contract: any,
    invoices: Invoice[],
    itemsByInvoiceId: Map<number, InvoiceItem[]>,
    context: { generatedAt: Date; settlement?: ContractSettlementSums }
): InvoiceSummaryMatrix {
    const rows: any[][] = [];
    const groups: RowGroup[] = [];

    rows.push([`Podsumowanie faktur - ${buildContractLabel(contract)}`]);
    rows.push([`Wygenerowano: ${formatStamp(context.generatedAt)}`]);
    rows.push(['']);
    rows.push(shiftRight(SETTLEMENT_LABELS));
    rows.push(shiftRight(buildSettlementValues(context.settlement)));
    rows.push(['']);
    rows.push([...HEADER]);

    // Poziom każdego wiersza — wiersze nagłówkowe nie mają poziomu.
    const rowLevels: (SheetLevel | null)[] = rows.map(() => null);
    let total = 0;

    for (const invoice of invoices) {
        const items = (invoice.id && itemsByInvoiceId.get(invoice.id)) || [];
        // Suma z pozycji, a nie z _totalNetValue: pozycje są tu i tak wypisane, więc
        // nagłówek faktury musi się zgadzać z tym, co widać pod nim.
        const netValue = round2(
            items.reduce((sum, item) => sum + netValueOf(item), 0)
        );
        total = round2(total + netValue);

        rows.push([
            invoice.number ?? '',
            invoice.issueDate ?? '',
            invoice.status ?? '',
            invoice.sentDate ?? '',
            invoice.paymentDeadline ?? '',
            '',
            '',
            netValue,
            invoice.description ?? '',
        ]);
        rowLevels.push(SHEET_LEVELS.INVOICE);

        const itemsStart = rows.length;
        items.forEach((item, index) => {
            rows.push([
                `${INDENT}${index + 1}.`,
                '',
                '',
                '',
                '',
                toNumber(item.quantity),
                toNumber(item.unitPrice),
                netValueOf(item),
                item.description ?? '',
            ]);
            rowLevels.push(SHEET_LEVELS.ITEM);
        });
        // Grupa musi obejmować co najmniej jeden wiersz — faktury bez pozycji pomijamy.
        if (rows.length > itemsStart)
            groups.push({ startRow: itemsStart, endRow: rows.length });
    }

    if (invoices.length) {
        rows.push(['RAZEM', '', '', '', '', '', '', total, '']);
        rowLevels.push(SHEET_LEVELS.TOTAL);
    } else {
        rows.push(['Kontrakt nie ma jeszcze faktur']);
        rowLevels.push(null);
    }

    return {
        values: rows,
        groups,
        levelRuns: collapseLevelRuns(rowLevels),
        colCount: HEADER.length,
    };
}

/**
 * Zwija poziomy kolejnych wierszy w ciągłe bloki — jedno żądanie formatowania na blok
 * zamiast jednego na wiersz (długi spis to inaczej setki żądań w batchu).
 */
function collapseLevelRuns(rowLevels: (SheetLevel | null)[]): LevelRun[] {
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

/** Etykieta kontraktu jak w spisie spraw: ourId/numer, alias, nazwa. */
function buildContractLabel(contract: any): string {
    const identifier = contract?.ourId ?? contract?.number ?? '';
    return [identifier, contract?.alias, contract?.name]
        .filter(Boolean)
        .join(' | ');
}

/** Przesuwa blok rozliczenia w prawo o SETTLEMENT_START_COLUMN pustych komórek. */
function shiftRight(cells: any[]): any[] {
    return [...new Array(SETTLEMENT_START_COLUMN).fill(''), ...cells];
}

/**
 * Kafelki rozliczenia w tej samej kolejności co na stronie kontraktu. Brak danych
 * zostawia komórkę pustą zamiast zera — zero znaczyłoby „policzono i wyszło 0".
 * Number.isFinite nie konwertuje, więc odsiewa też undefined, null i NaN z parseFloat.
 */
function buildSettlementValues(settlement?: ContractSettlementSums): any[] {
    return [
        settlement?.value,
        settlement?.totalIssuedValue,
        settlement?.remainingIssuedValue,
        settlement?.totalRegisteredValue,
        settlement?.remainingRegisteredValue,
    ].map((value) => (Number.isFinite(value) ? round2(value as number) : ''));
}

/**
 * Wartość netto pozycji liczona tu, a nie brana z `_netValue` modelu: pozycje z bazy
 * bywają rekonstruowane różnymi ścieżkami, a arkusz musi sumować się do grosza.
 */
function netValueOf(item: InvoiceItem): number {
    return round2(toNumber(item.quantity) * toNumber(item.unitPrice));
}

function toNumber(value: any): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function formatStamp(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return (
        `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
}

function formatDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
        date.getDate()
    )}`;
}
