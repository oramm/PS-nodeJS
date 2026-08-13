/**
 * Kontrakt kolumn rejestru listow (zakladka `poczta wych. <rok>`).
 *
 * Wartosci potwierdzone odczytem zywej zakladki w checkpointach P0 i P4.
 * Pelny opis: documentation/team/operations/petty-cash-sheets/plan.md, sekcja 2.5
 *
 * Blok = jedna wizyta na poczcie = jedna faktura Poczty:
 *   wiersz naglowkowy | N wierszy pozycji | wiersz sumy | wiersz pusty (separator)
 */

/** Indeksy 0-based, bo tego oczekuje Sheets API. */
export const POSTAL_COL = {
    /** A - numer bloku, tylko w wierszu naglowkowym; scalony pionowo przez caly blok */
    blockNumber: 0,
    /** B - numer pozycji w wierszu listu; w naglowku numer faktury Poczty, scalony B:D */
    itemIndex: 1,
    /** C - adresat */
    addressee: 2,
    /** D - co wyslano */
    contents: 3,
    /** E - numer nadania w postaci `(00)` + 18 cyfr; w naglowku etykieta kolumny */
    tracking: 4,
    /** F - data nadania, prawdziwa data; tylko w pierwszym wierszu pozycji, scalona pionowo */
    date: 5,
    /** G - kwota; w wierszu sumy formula */
    amount: 6,
    /** H - kto zaplacil, tylko w wierszu sumy */
    payer: 7,
    /** I - ukryta kolumna techniczna robota (P0: I-AC puste w calej zakladce) */
    marker: 8,
} as const;

/** Zapis wartosci obejmuje A..I. */
export const POSTAL_WIDTH = POSTAL_COL.marker + 1;

/** Kopiowanie formatowania obejmuje tylko czesc widoczna, A..H. */
export const POSTAL_VISIBLE_WIDTH = POSTAL_COL.payer + 1;

/**
 * Wiersz sumy poznajemy po formule w kolumnie kwoty. Wzorzec jest celowo luzny:
 * bloki jednopozycyjne uzywaja `=SUM(G429)` zamiast zakresu, a jeden blok w zywym
 * arkuszu ma sume wskazujaca wlasny naglowek - defekt sprzed automatyzacji, ktorego
 * nie naprawiamy, ale ktory musi zostac rozpoznany jako wiersz sumy.
 */
export const SUM_ROW_PATTERN = /^=SUM\(/i;
