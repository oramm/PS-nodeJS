import crypto from 'crypto';
import { EntryKind, SettlementMethod } from './pettyCashTypes';
import PostalDispatch from './postal/PostalDispatch';

/**
 * Wpis do arkusza zaliczek: jeden wydatek albo jedna wyplata zaliczki.
 *
 * To jest byt glowny modulu. Wysylka pocztowa (`PostalDispatch`) jest jego
 * opcjonalnym szczegolem, wystepujacym tylko dla rodzaju `POSTAL`.
 *
 * Model jest obiektem domenowym bez trwalosci: nie ma `id`, nie jest zapisywany
 * do bazy i nie zna repozytorium. Niesie wylacznie te reguly, ktorych z arkusza
 * nie da sie odczytac, bo w arkuszu nikt ich nie zapisal - istnieja w glowach
 * osob, ktore go prowadza.
 *
 * Arkusz jest rozliczeniem portfela i karty firmowej, nie ksiega. Dlatego to
 * `settlementMethod` decyduje o kolumnie wplywu, a nie rodzaj zakupu.
 * Kontrakt kolumn: documentation/team/operations/petty-cash-sheets/plan.md, sekcja 2.4
 */
export default class PettyCashEntry {
    entryKind: EntryKind;
    /** YYYY-MM-DD */
    entryDate: string;
    description: string;
    netAmount: number | null;
    grossAmount: number | null;
    noDocumentAmount: number | null;
    inflowAmount: number | null;
    documentNumber: string | null;
    payerLabel: string;
    settlementMethod: SettlementMethod;
    /** Wolna notatka; kolumna J arkusza. */
    note: string | null;

    /** Szczegol pocztowy - tylko dla rodzaju POSTAL. */
    _dispatch?: PostalDispatch;

    constructor(data: Partial<PettyCashEntry>) {
        this.entryKind = (data.entryKind ?? 'INVOICE') as EntryKind;
        this.entryDate = PettyCashEntry.normalizeDate(data.entryDate);
        this.description = String(data.description ?? '').trim();
        this.netAmount = PettyCashEntry.parseAmountOrNull(data.netAmount);
        this.grossAmount = PettyCashEntry.parseAmountOrNull(data.grossAmount);
        this.noDocumentAmount = PettyCashEntry.parseAmountOrNull(
            data.noDocumentAmount
        );
        this.inflowAmount = PettyCashEntry.parseAmountOrNull(data.inflowAmount);
        this.documentNumber = data.documentNumber?.trim() || null;
        this.payerLabel = String(data.payerLabel ?? '').trim();
        this.settlementMethod = (data.settlementMethod ??
            'CASH') as SettlementMethod;
        this.note = data.note?.trim() || null;
        this._dispatch = data._dispatch;
    }

    /**
     * Kwota w kolumnie wydatku (G). W arkuszu jest to formula `=E<r>+F<r>`,
     * wiec brutto i kwota bez dokumentu nigdy nie wystepuja razem.
     */
    get expenseAmount(): number {
        const total = (this.grossAmount ?? 0) + (this.noDocumentAmount ?? 0);
        return Math.round(total * 100) / 100;
    }

    /**
     * Kwota, ktora powinna stac w kolumnie wplywu (B).
     * - `CARD`    - lustro wydatku, bo karta nie uszczupla portfela
     * - `ADVANCE` - kwota przekazana do portfela, podana przez uzytkownika
     * - `CASH`    - pusto
     */
    get expectedInflowAmount(): number | null {
        if (this.settlementMethod === 'CARD') return this.expenseAmount;
        if (this.settlementMethod === 'ADVANCE') return this.inflowAmount;
        return null;
    }

    get requiresPostalDispatch(): boolean {
        return this.entryKind === 'POSTAL';
    }

    /**
     * Tekst, ktory trafia do kolumny "kto zaplacil" arkusza.
     *
     * W arkuszu sposob platnosci i osoba stoja w jednej komorce: `got. Karolina`,
     * `karta Krzysiek`. To jedyne miejsce, w ktorym widac, czym zaplacono - bez tego
     * wiersz robota daloby sie odroznic od ludzkiego na pierwszy rzut oka.
     *
     * Przedrostek wpisany przez czlowieka zdejmujemy, zeby nie powstalo `got. got. Michal`.
     */
    get sheetPayerLabel(): string {
        const name = this.payerLabel
            .replace(/^\s*(got\.?|gotówk[aą]|karta\.?|kart[ąa])\s+/i, '')
            .trim();
        if (!name) return this.payerLabel.trim();
        return this.settlementMethod === 'CARD' ? `karta ${name}` : `got. ${name}`;
    }

    /**
     * Invarianty domenowe wpisu. Puste = wpis spojny.
     *
     * Nie sprawdza ksztaltu DTO ani uprawnien - to zadanie walidatora.
     * Sprawdza to, co po zapisaniu do arkusza rozjechaloby saldo portfela
     * albo sumy miesieczne.
     */
    consistencyErrors(): string[] {
        const errors: string[] = [];

        if (!this.description) errors.push('Brak opisu wpisu.');
        if (!this.payerLabel) errors.push('Brak informacji, kto zaplacil.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(this.entryDate))
            errors.push(
                `Data "${this.entryDate}" nie jest data w formacie YYYY-MM-DD.`
            );

        errors.push(...this.amountErrorsForKind());
        errors.push(...this.settlementErrors());

        if (this.requiresPostalDispatch) {
            if (!this._dispatch)
                errors.push('Wpis pocztowy wymaga listy wyslanych listow.');
            else errors.push(...this._dispatch.consistencyErrors(this.grossAmount));
        } else if (this._dispatch) {
            errors.push('Tylko wpis pocztowy moze miec liste listow.');
        }

        return errors;
    }

    private amountErrorsForKind(): string[] {
        const errors: string[] = [];
        const { netAmount, grossAmount } = this;

        switch (this.entryKind) {
            case 'POSTAL':
                if (netAmount === null || grossAmount === null)
                    errors.push('Wpis pocztowy wymaga kwoty netto i brutto.');
                else if (netAmount !== grossAmount)
                    errors.push(
                        'Uslugi pocztowe sa zwolnione z VAT - netto musi rownac sie brutto.'
                    );
                if (this.noDocumentAmount)
                    errors.push('Wpis pocztowy nie moze miec kwoty bez dokumentu.');
                if (!this.documentNumber)
                    errors.push('Wpis pocztowy wymaga numeru faktury Poczty.');
                break;

            case 'INVOICE':
            case 'RECEIPT':
                if (netAmount === null || grossAmount === null)
                    errors.push('Wpis z dokumentem wymaga kwoty netto i brutto.');
                else if (netAmount > grossAmount)
                    errors.push('Kwota netto nie moze byc wyzsza od brutto.');
                if (this.noDocumentAmount)
                    errors.push(
                        'Wpis z dokumentem nie moze miec kwoty bez dokumentu.'
                    );
                if (!this.documentNumber)
                    errors.push('Wpis z dokumentem wymaga numeru dokumentu.');
                break;

            case 'NO_DOCUMENT':
                if (!this.noDocumentAmount || this.noDocumentAmount <= 0)
                    errors.push('Wydatek bez dokumentu wymaga kwoty.');
                if (netAmount !== null || grossAmount !== null)
                    errors.push(
                        'Wydatek bez dokumentu nie moze miec kwoty netto ani brutto.'
                    );
                break;

            case 'ADVANCE':
                if (!this.inflowAmount || this.inflowAmount <= 0)
                    errors.push('Wyplata zaliczki wymaga przekazanej kwoty.');
                if (
                    netAmount !== null ||
                    grossAmount !== null ||
                    this.noDocumentAmount !== null
                )
                    errors.push('Wyplata zaliczki nie moze miec kwot wydatku.');
                break;
        }

        return errors;
    }

    private settlementErrors(): string[] {
        const errors: string[] = [];

        if (this.settlementMethod === 'ADVANCE' && this.entryKind !== 'ADVANCE')
            errors.push(
                'Rozliczenie typu ADVANCE jest dozwolone tylko dla wyplaty zaliczki.'
            );
        if (this.entryKind === 'ADVANCE' && this.settlementMethod !== 'ADVANCE')
            errors.push('Wyplata zaliczki musi miec rozliczenie typu ADVANCE.');

        const expected = this.expectedInflowAmount;
        if (expected === null && this.inflowAmount !== null)
            errors.push(
                'Wydatek gotowkowy nie moze miec kwoty w kolumnie wplywu - zaburza saldo portfela.'
            );
        if (this.settlementMethod === 'CARD' && this.inflowAmount !== expected)
            errors.push(
                'Wydatek kartowy musi miec w kolumnie wplywu kwote rowna wydatkowi - ' +
                    'inaczej saldo portfela sie rozjedzie.'
            );

        return errors;
    }

    /**
     * Klucz tresci wpisu. Sluzy do dwoch rzeczy naraz, obu realizowanych przez
     * odczyt arkusza, nie bazy:
     *  - wykrycia, ze ten sam dokument juz zostal wpisany,
     *  - oznaczenia wiersza jako naleznego do robota.
     *
     * Opis wchodzi do klucza, bo dwie wyplaty bez dokumentu tego samego dnia
     * i na te sama kwote roznia sie tylko nim.
     */
    contentKey(): string {
        const parts = [
            this.entryKind,
            this.entryDate,
            this.documentNumber ?? '-',
            this.expenseAmount.toFixed(2),
            (this.inflowAmount ?? 0).toFixed(2),
            this.description.toLowerCase().replace(/\s+/g, ' '),
        ];
        return crypto
            .createHash('sha1')
            .update(parts.join('|'), 'utf-8')
            .digest('hex')
            .slice(0, 12);
    }

    /**
     * Znacznik wlasnosci wiersza, wpisywany do ukrytej kolumny N arkusza zaliczek.
     * Wiersz bez znacznika nalezy do czlowieka i robot go nie tyka.
     */
    sheetMarker(): string {
        return `auto:${this.contentKey()}`;
    }

    static parseAmountOrNull(value: unknown): number | null {
        if (value === null || value === undefined || value === '') return null;
        const parsed = Number.parseFloat(String(value).replace(',', '.'));
        return Number.isNaN(parsed) ? null : Math.round(parsed * 100) / 100;
    }

    /** Przyjmuje `Date`, `YYYY-MM-DD` i `YYYY/MM/DD` - arkusz ma wszystkie trzy warianty. */
    static normalizeDate(value: unknown): string {
        if (value instanceof Date) return value.toISOString().slice(0, 10);
        return String(value ?? '')
            .trim()
            .replace(/\//g, '-')
            .slice(0, 10);
    }
}
