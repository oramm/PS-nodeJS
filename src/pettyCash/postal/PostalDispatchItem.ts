/**
 * Pojedynczy list w ramach jednej wysylki na poczte.
 *
 * Odpowiada jednemu wierszowi pozycji w bloku rejestru listow:
 * kolumna B = `itemIndex`, C = `addressee`, D = `contentsDescription`,
 * E = `trackingNumber`, G = `amount`.
 *
 * Obiekt domenowy bez trwalosci.
 */
export default class PostalDispatchItem {
    itemIndex: number;
    /** 20 cyfr, bez identyfikatora aplikacji `(00)`. */
    trackingNumber: string;
    addressee: string;
    contentsDescription: string | null;
    amount: number;

    constructor(data: Partial<PostalDispatchItem>) {
        this.itemIndex = Number(data.itemIndex ?? 0);
        this.trackingNumber =
            PostalDispatchItem.normalizeTrackingNumber(data.trackingNumber) ??
            String(data.trackingNumber ?? '').trim();
        this.addressee = String(data.addressee ?? '').trim();
        this.contentsDescription = data.contentsDescription?.trim() || null;
        this.amount = PostalDispatchItem.parseAmount(data.amount);
    }

    /**
     * Normalizuje numer nadania do 18 cyfr SSCC.
     *
     * Kod kreskowy GS1-128 na potwierdzeniu nadania niesie identyfikator aplikacji
     * `(00)`, ktory nie jest czescia numeru: skaner zwraca `00` + 18 cyfr, czyli
     * 20 znakow. W arkuszu numer stoi w postaci `(00)` + 18 cyfr, w kodzie trzymamy
     * same 18 cyfr.
     *
     * Odrzucamy wszystko, co nie ma 18 cyfr albo nie przechodzi cyfry kontrolnej.
     * Cichy blad akurat w tym polu bylby nie do wykrycia okiem - nikt nie sprawdza
     * osiemnastu cyfr wzrokiem - wiec lepiej odmowic niz przyjac przeklamany odczyt.
     */
    static normalizeTrackingNumber(
        raw: string | null | undefined
    ): string | null {
        if (!raw) return null;
        const digits = String(raw).replace(/\D+/g, '');
        const candidate =
            digits.length === 20 && digits.startsWith('00')
                ? digits.slice(2)
                : digits;
        if (candidate.length !== 18) return null;
        return this.hasValidCheckDigit(candidate) ? candidate : null;
    }

    /**
     * Cyfra kontrolna GS1 (mod 10) dla 18-cyfrowego SSCC.
     * Liczona od prawej: pozycje nieparzyste waga 3, parzyste waga 1.
     */
    static hasValidCheckDigit(sscc: string): boolean {
        if (!/^\d{18}$/.test(sscc)) return false;
        const data = sscc.slice(0, 17);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            const digit = Number(data[data.length - 1 - i]);
            sum += i % 2 === 0 ? digit * 3 : digit;
        }
        const expected = (10 - (sum % 10)) % 10;
        return expected === Number(sscc[17]);
    }

    static isValidTrackingNumber(raw: string | null | undefined): boolean {
        return this.normalizeTrackingNumber(raw) !== null;
    }

    /** Postac uzywana w arkuszu: `(00)` + 18 cyfr SSCC. */
    static formatTrackingNumberForSheet(trackingNumber: string): string {
        return `(00)${trackingNumber}`;
    }

    /**
     * Postac, ktorej oczekuje wyszukiwarka Poczty: 20 znakow bez nawiasow,
     * czyli identyfikator aplikacji `00` sklejony z 18 cyframi SSCC.
     */
    static formatTrackingNumberForSearch(trackingNumber: string): string {
        return `00${trackingNumber}`;
    }

    /** Adres sledzenia zbudowany z szablonu; brak `{number}` w szablonie = brak linku. */
    static buildTrackingUrl(template: string, trackingNumber: string): string | null {
        if (!template.includes('{number}')) return null;
        return template.replace(
            '{number}',
            this.formatTrackingNumberForSearch(trackingNumber)
        );
    }

    /** Akceptuje `12,34` i `12.34`; puste wejscie daje 0. */
    static parseAmount(value: unknown): number {
        if (value === null || value === undefined || value === '') return 0;
        const parsed = Number.parseFloat(String(value).replace(',', '.'));
        return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
    }

    /** Invarianty pozycji. Puste = pozycja poprawna. */
    consistencyErrors(): string[] {
        const errors: string[] = [];
        if (!PostalDispatchItem.isValidTrackingNumber(this.trackingNumber))
            errors.push(
                `Numer nadania "${this.trackingNumber}" nie jest poprawnym numerem przesylki ` +
                    '(oczekiwane 18 cyfr SSCC z prawidlowa cyfra kontrolna).'
            );
        if (!this.addressee) errors.push('Brak adresata listu.');
        if (!(this.amount > 0))
            errors.push(
                `Kwota listu do "${this.addressee || '(brak adresata)'}" musi byc wieksza od zera.`
            );
        return errors;
    }
}
