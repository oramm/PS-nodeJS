import PostalDispatchItem from './PostalDispatchItem';

/**
 * Jedna wysylka na poczte: jedna wizyta = jedna faktura Poczty = N listow.
 *
 * Jest szczegolem wpisu do zaliczek rodzaju `POSTAL`, a nie bytem samodzielnym.
 * W rejestrze listow odpowiada jednemu blokowi: wiersz naglowkowy z numerem
 * faktury, N wierszy pozycji, wiersz sumy.
 *
 * Obiekt domenowy bez trwalosci. Gdzie blok stoi w arkuszu i czy juz tam jest -
 * odczytuje sie z arkusza, nie z bazy.
 */
export default class PostalDispatch {
    /** Numer faktury Poczty, np. `F00005G012600999273P`. Znany juz w chwili nadania. */
    invoiceNumber: string;
    items: PostalDispatchItem[];

    constructor(data: Partial<PostalDispatch>) {
        this.invoiceNumber = String(data.invoiceNumber ?? '').trim();
        this.items = (data.items ?? []).map((item) =>
            item instanceof PostalDispatchItem
                ? item
                : new PostalDispatchItem(item)
        );
    }

    /** Suma kwot pozycji. Musi zgodzic sie z kwota brutto wpisu do zaliczek. */
    get itemsTotal(): number {
        const total = this.items.reduce((sum, item) => sum + item.amount, 0);
        return Math.round(total * 100) / 100;
    }

    /**
     * Invarianty wysylki sprawdzane wzgledem kwoty brutto wpisu.
     *
     * Kontrola sumy jest tu najwazniejsza: to ona wychwytuje bledna kwote listu,
     * bo suma pozycji musi rownac sie kwocie z faktury Poczty. Bez niej pomylka
     * w kwocie pojedynczego listu przeszlaby niezauwazona.
     */
    consistencyErrors(entryGrossAmount: number | null): string[] {
        const errors: string[] = [];

        if (!this.invoiceNumber)
            errors.push('Brak numeru faktury Poczty dla wysylki.');

        if (this.items.length === 0) {
            errors.push('Wysylka nie zawiera zadnego listu.');
            return errors;
        }

        this.items.forEach((item) => errors.push(...item.consistencyErrors()));

        this.findDuplicateTrackingNumbers().forEach((trackingNumber) =>
            errors.push(
                `Numer nadania ${trackingNumber} powtarza sie w tej wysylce.`
            )
        );

        if (entryGrossAmount !== null) {
            const difference =
                Math.round((this.itemsTotal - entryGrossAmount) * 100) / 100;
            if (difference !== 0)
                errors.push(
                    `Suma listow (${this.itemsTotal.toFixed(2)}) nie zgadza sie z kwota faktury ` +
                        `(${entryGrossAmount.toFixed(2)}). Roznica: ${difference.toFixed(2)}.`
                );
        }

        return errors;
    }

    private findDuplicateTrackingNumbers(): string[] {
        const seen = new Set<string>();
        const duplicates = new Set<string>();
        for (const item of this.items) {
            if (seen.has(item.trackingNumber)) duplicates.add(item.trackingNumber);
            seen.add(item.trackingNumber);
        }
        return [...duplicates];
    }

    /**
     * Znacznik wlasnosci bloku, wpisywany do wolnej kolumny I rejestru listow.
     * Numer faktury Poczty jest unikalny, wiec sluzy zarazem za klucz jednokrotnosci:
     * przed zapisem skanujemy kolumne B zakladki i odmawiamy, jesli juz tam jest.
     */
    sheetMarker(): string {
        return `auto:${this.invoiceNumber}`;
    }
}
