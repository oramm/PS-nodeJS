/**
 * Numer tygodnia scrumboarda.
 * Zwraca (ISO week − 1), czyli numer POPRZEDNIEGO tygodnia — zgodnie z konwencją
 * nazewnictwa raportów scrumboarda.
 */
export function getScrumWeekNumber(date: Date = new Date()): number {
    const d = new Date(
        Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
    );
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(
        ((d.valueOf() - yearStart.valueOf()) / 86400000 + 1) / 7
    );
    return weekNo - 1;
}
