export interface InvoiceSeriesInput {
    sourceInvoiceId: number;
    totalCount: number;
    intervalMonths: number;
    /** null keeps the source day as the anchor, even when February clamps it. */
    firstSaleDate: string | null;
}

export interface InvoiceSeriesPreview {
    saleDates: string[];
    netAmount: number;
    grossAmount: number;
}

export class InvoiceSeriesValidationError extends Error {
    status = 400;
}

export default class InvoiceSeriesValidator {
    static input(value: any): InvoiceSeriesInput {
        if (!Number.isSafeInteger(value?.sourceInvoiceId) || value.sourceInvoiceId < 1)
            throw new InvoiceSeriesValidationError('Nieprawidłowa faktura źródłowa.');
        if (!Number.isSafeInteger(value.totalCount) || value.totalCount < 2 || value.totalCount > 100)
            throw new InvoiceSeriesValidationError('Łączna liczba faktur musi wynosić od 2 do 100.');
        if (!Number.isSafeInteger(value.intervalMonths) || value.intervalMonths < 1 || value.intervalMonths > 12)
            throw new InvoiceSeriesValidationError('Odstęp musi być liczbą całkowitą od 1 do 12 miesięcy.');
        const firstSaleDate = value.firstSaleDate ?? null;
        if (firstSaleDate !== null) this.date(firstSaleDate);
        return { sourceInvoiceId: value.sourceInvoiceId, totalCount: value.totalCount,
            intervalMonths: value.intervalMonths, firstSaleDate };
    }

    static requestId(value: unknown): string {
        if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
            throw new InvoiceSeriesValidationError('Nieprawidłowy identyfikator żądania.');
        return value.toLowerCase();
    }

    private static date(value: string): Date {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
            throw new InvoiceSeriesValidationError('Podaj poprawną datę sprzedaży.');
        const date = new Date(value + 'T00:00:00.000Z');
        if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getUTCFullYear() < 1000)
            throw new InvoiceSeriesValidationError('Podaj poprawną datę sprzedaży.');
        return date;
    }

    static dates(sourceSaleDate: string, input: InvoiceSeriesInput): string[] {
        const source = this.date(sourceSaleDate);
        const anchor = input.firstSaleDate === null ? source : this.date(input.firstSaleDate);
        const dates = [sourceSaleDate];
        for (let index = 0; index < input.totalCount - 1; index++) {
            const offset = (index + (input.firstSaleDate === null ? 1 : 0)) * input.intervalMonths;
            const monthIndex = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth() + offset;
            const year = Math.floor(monthIndex / 12);
            const month = monthIndex % 12;
            if (!Number.isSafeInteger(monthIndex) || year > 9999)
                throw new InvoiceSeriesValidationError('Harmonogram wykracza poza rok 9999.');
            const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
            dates.push(new Date(Date.UTC(year, month, Math.min(anchor.getUTCDate(), lastDay))).toISOString().slice(0, 10));
        }
        return dates;
    }
}
