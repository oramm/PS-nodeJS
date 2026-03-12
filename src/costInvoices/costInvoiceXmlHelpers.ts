/**
 * Czyste funkcje pomocnicze do parsowania XML faktur KSeF.
 * Brak zależności od DB/Google/Express — w pełni testowalny moduł.
 */

/**
 * Wyciąga datę sprzedaży z sekcji Fa (FA(3)).
 * P_6 = pole semantyczne "data dokonania lub zakończenia dostawy towarów / wykonania usługi"
 *
 * Priorytety:
 *   1. fa.P_6 — właściwe pole FA(3) (obecne tylko gdy data sprzedaży różni się od daty wystawienia)
 *   2. naglowek.DataSprzedazy — fallback dla starszych wariantów
 *   3. fa.P_1 — data wystawienia (w FA(3) gdy brak P_6, data sprzedaży = data wystawienia)
 *   4. najwcześniejsza fa.FaWiersz[].P_6A — gdy brak P_6 na poziomie faktury
 */
export function extractSaleDateFromFa(fa: any, naglowek: any): Date | undefined {
    if (fa.P_6) return new Date(fa.P_6);
    if (naglowek?.DataSprzedazy) return new Date(naglowek.DataSprzedazy);
    if (fa.P_1) return new Date(fa.P_1);
    const wiersze = Array.isArray(fa.FaWiersz) ? fa.FaWiersz : fa.FaWiersz ? [fa.FaWiersz] : [];
    const dates = wiersze
        .map((w: any) => w.P_6A)
        .filter(Boolean)
        .map((d: string) => new Date(d))
        .filter((d: Date) => !isNaN(d.getTime()));
    if (dates.length === 0) return undefined;
    return new Date(Math.min(...dates.map((d: Date) => d.getTime())));
}

/**
 * Kody form płatności FA(3) i ich polskie nazwy.
 * Źródło: schemat KSeF FA(3), pole Fa.Platnosc.FormaPlatnosci
 */
const PAYMENT_METHOD_LABELS: Record<string, string> = {
    '1': 'gotówka',
    '2': 'karta',
    '3': 'bon',
    '4': 'czek',
    '5': 'kredyt',
    '6': 'przelew',
    '7': 'płatność mobilna',
};

/**
 * Wyciąga formę płatności z sekcji Fa (FA(3)).
 * Fa.Platnosc.FormaPlatnosci — kod 1-7.
 *
 * Zwraca czytelną etykietę (np. 'gotówka') lub undefined gdy pole brak.
 */
export function extractPaymentMethodFromFa(fa: any): string | undefined {
    const platnosc = fa?.Platnosc;
    if (!platnosc) return undefined;
    const code = String(platnosc.FormaPlatnosci ?? '').trim();
    if (!code) return undefined;
    return PAYMENT_METHOD_LABELS[code] ?? `forma ${code}`;
}

function isKsefFlagEnabled(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    const normalized = String(value).trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'tak';
}

/**
 * Kody rodzajów faktur FA(3) i ich polskie nazwy.
 * Źródło: schemat KSeF FA(3), pole Fa.RodzajFaktury
 */

/**
 * Wyciąga rodzaj faktury z sekcji Fa (FA(3)).
 * Fa.RodzajFaktury — kod np. VAT, KOR, ZAL, ROZ, UPR, KOR_ZAL, KOR_ROZ.
 *
 * Zwraca czytelną etykietę (np. 'Korekta') lub undefined gdy pole brak.
 */
export function extractInvoiceTypeFromFa(fa: any): string | undefined {
    const code = String(fa?.RodzajFaktury ?? '').trim().toUpperCase();
    return code || undefined;
}

/**
 * Wyciąga informacje o zapłacie z sekcji Fa.Platnosc (FA(3)).
 *
 * FA(3) używa struktury:
 *   Zaplacono = 1                    → faktura oznaczona jako opłacona w całości
 *   DataZaplaty                      → data pełnej zapłaty (przy Zaplacono=1)
 *   ZnacznikZaplatyCzesciowej = 1  → w sekcji są dane o wpłatach
 *   ZaplataCzesciowa (obiekt lub tablica):
 *     KwotaZaplatyCzesciowej  → kwota wpłacona (brutto)
 *     DataZaplatyCzesciowej   → data wpłaty
 *     FormaPlatnosci          → forma tej wpłaty
 *
 * Logika:
 *   - Zaplacono = 1                                 → PAID, paidAmount = grossAmount, paymentDate = DataZaplaty
 *   - suma KwotaZaplatyCzesciowej >= grossAmount → PAID, paymentDate = najnowsza DataZaplatyCzesciowej
 *   - 0 < suma < grossAmount                     → PARTIALLY_PAID, paymentDate = najnowsza DataZaplatyCzesciowej
 *   - brak flag płatności lub kwota=0            → UNPAID
 *   - dokument ujemny bez danych płatności       → NOT_APPLICABLE
 */
export function extractPaymentInfoFromFa(
    fa: any,
    grossAmount: number,
    netAmount?: number,
): { paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' | 'NOT_APPLICABLE'; paidAmount: number; paymentDate?: Date } {
    const platnosc = fa?.Platnosc;
    const defaultStatus = grossAmount < 0 ? 'NOT_APPLICABLE' : 'UNPAID';
    if (!platnosc) return { paymentStatus: defaultStatus, paidAmount: 0 };
    void netAmount;

    // FA(3): osobny znacznik dla pełnej zapłaty ma wyższy priorytet niż wpłaty częściowe.
    if (isKsefFlagEnabled(platnosc.Zaplacono)) {
        const paymentDate = platnosc.DataZaplaty ? new Date(platnosc.DataZaplaty) : undefined;
        return {
            paymentStatus: 'PAID',
            paidAmount: grossAmount,
            paymentDate: paymentDate && !isNaN(paymentDate.getTime()) ? paymentDate : undefined,
        };
    }

    // FA(3): brak aktywnego znacznika płatności częściowej → brak wpłat.
    if (!isKsefFlagEnabled(platnosc.ZnacznikZaplatyCzesciowej)) {
        return { paymentStatus: defaultStatus, paidAmount: 0 };
    }

    // ZaplataCzesciowa może być obiektem lub tablicą (wiele wpłat)
    let wpłaty = platnosc.ZaplataCzesciowa;
    if (!wpłaty) return { paymentStatus: defaultStatus, paidAmount: 0 };
    if (!Array.isArray(wpłaty)) wpłaty = [wpłaty];

    const totalPaid = wpłaty.reduce((sum: number, z: any) => {
        const kwota = parseFloat(String(z.KwotaZaplatyCzesciowej ?? '0').replace(',', '.'));
        return sum + (isFinite(kwota) && kwota > 0 ? kwota : 0);
    }, 0);

    if (totalPaid <= 0) return { paymentStatus: defaultStatus, paidAmount: 0 };

    // Najnowsza data wpłaty częściowej
    const partialDates = wpłaty
        .map((z: any) => z.DataZaplatyCzesciowej)
        .filter(Boolean)
        .map((d: string) => new Date(d))
        .filter((d: Date) => !isNaN(d.getTime()));
    const latestDate =
        partialDates.length > 0
            ? new Date(Math.max(...partialDates.map((d: Date) => d.getTime())))
            : undefined;

    if (totalPaid >= grossAmount) {
        return { paymentStatus: 'PAID', paidAmount: grossAmount, paymentDate: latestDate };
    }

    return { paymentStatus: 'PARTIALLY_PAID', paidAmount: totalPaid, paymentDate: latestDate };
}

/**
 * Wyciąga najwcześniejszy termin płatności z sekcji Fa (FA(3)).
 * Fa.Platnosc.TerminPlatnosci może być obiektem lub tablicą obiektów.
 * Każdy element ma pole Termin (YYYY-MM-DD).
 *
 * Fallback: fa.TerminPlatnosci?.TerminPlatnosci (stary wariant pre-FA3)
 */
export function extractDueDateFromFa(fa: any): Date | undefined {
    // FA(3): Fa.Platnosc.TerminPlatnosci[].Termin
    const platnosc = fa.Platnosc;
    if (platnosc?.TerminPlatnosci) {
        let terminy = platnosc.TerminPlatnosci;
        if (!Array.isArray(terminy)) terminy = [terminy];
        const dates = terminy
            .map((t: any) => t.Termin)
            .filter(Boolean)
            .map((d: string) => new Date(d))
            .filter((d: Date) => !isNaN(d.getTime()));
        if (dates.length > 0)
            return new Date(Math.min(...dates.map((d: Date) => d.getTime())));
    }
    // Fallback: stary wariant
    if (fa.TerminPlatnosci?.TerminPlatnosci)
        return new Date(fa.TerminPlatnosci.TerminPlatnosci);
    return undefined;
}
