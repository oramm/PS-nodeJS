/**
 * Kontrakt kolumn arkusza zaliczek.
 *
 * Wartosci potwierdzone odczytem zakladki `zaliczki 2026` w checkpoincie P0.
 * Pelny opis: documentation/team/operations/petty-cash-sheets/plan.md, sekcja 2.4
 */

/** Indeksy 0-based, bo tego oczekuje Sheets API w `updateCells`. */
export const PETTY_CASH_COL = {
    date: 0, // A
    inflow: 1, // B - "ZALICZKA, zapalata karta (wplyw)"
    description: 2, // C - "OPIS"
    net: 3, // D - "NETTO"
    gross: 4, // E - "BRUTTO"
    noDocument: 5, // F - "BEZ FV / PARAGON"
    expense: 6, // G - "wydatek", zawsze formula =E+F
    documentNumber: 7, // H - "saldo / Nr faktury"
    payer: 8, // I - kto zaplacil, np. "got. Karolina"
    note: 9, // J - wolna notatka
    marker: 13, // N - ukryta kolumna techniczna robota (P0: N-Z puste w calej zakladce)
} as const;

/** Ile kolumn obejmuje jeden zapis robota: A..N wlacznie. */
export const PETTY_CASH_WIDTH = PETTY_CASH_COL.marker + 1;

/**
 * Wiersz zbiorczy miesiaca poznajemy po formule sumy w kolumnie wplywu.
 * Zakres danych miesiaca bierzemy wprost z tej formuly, nigdy z arytmetyki
 * na numerach wierszy - inaczej wpis wyladowalby poza suma miesiaca.
 */
export const MONTH_SUM_PATTERN = /^=SUM\(B(\d+):B(\d+)\)$/i;

/** Kanoniczny wiersz danych ma w kolumnie wydatku wlasnie taka formule. */
export const EXPENSE_FORMULA_PATTERN = /^=E(\d+)\+F(\d+)$/i;

/** Skroty miesiecy uzywane w kolumnie A wiersza zbiorczego, gdy nie jest data. */
export const MONTH_ABBREVIATIONS: Record<string, number> = {
    sty: 1,
    lut: 2,
    mar: 3,
    kwi: 4,
    maj: 5,
    cze: 6,
    lip: 7,
    sie: 8,
    wrz: 9,
    paz: 10,
    lis: 11,
    gru: 12,
};
