/**
 * Wspolne typy modulu zaliczek (petty cash).
 *
 * Modul nie ma wlasnych tabel. Zrodlem prawdy sa arkusze Google: arkusz zaliczek
 * i rejestr listow. Baza nie trzyma kopii wpisow, bo kopia rozjechalaby sie po
 * cichu przy pierwszej recznej poprawce w arkuszu.
 *
 * Kontrakt kolumn: documentation/team/operations/petty-cash-sheets/plan.md
 */

/**
 * Rodzaj wpisu. Decyduje o tym, ktore kolumny kwotowe arkusza sa wypelniane.
 * Szczegoly: plan.md, sekcja 2.2
 */
export const ENTRY_KINDS = [
    /** poczta - listy; netto = brutto (usluga zwolniona z VAT), ma blok w rejestrze listow */
    'POSTAL',
    /** zakup z faktura VAT; netto != brutto */
    'INVOICE',
    /** paragon albo faktura uproszczona (poza KSeF) */
    'RECEIPT',
    /** wydatek bez dokumentu; kwota trafia do kolumny "BEZ FV / PARAGON" */
    'NO_DOCUMENT',
    /** wyplata zaliczki; kwota tylko w kolumnie wplywu, wydatek 0,00 */
    'ADVANCE',
] as const;

export type EntryKind = (typeof ENTRY_KINDS)[number];

/**
 * Sposob rozliczenia. Decyduje o kolumnie wplywu, a przez to o saldzie portfela.
 * Szczegoly: plan.md, sekcja 2.3
 */
export const SETTLEMENT_METHODS = [
    /** gotowka z portfela; kolumna wplywu pusta */
    'CASH',
    /** karta firmowa; kolumna wplywu lustrzana do wydatku, saldo portfela bez zmian */
    'CARD',
    /** wyplata zaliczki do portfela; kolumna wplywu = przekazana kwota */
    'ADVANCE',
] as const;

export type SettlementMethod = (typeof SETTLEMENT_METHODS)[number];

export function isEntryKind(value: unknown): value is EntryKind {
    return ENTRY_KINDS.includes(value as EntryKind);
}

export function isSettlementMethod(value: unknown): value is SettlementMethod {
    return SETTLEMENT_METHODS.includes(value as SettlementMethod);
}
