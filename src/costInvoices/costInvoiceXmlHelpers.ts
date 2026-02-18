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
