/**
 * Daty w arkuszach Google to liczby: dni od 1899-12-30.
 *
 * Zapisujemy je jako liczby, a nie jako tekst, zeby komorka pozostala prawdziwa data -
 * inaczej sortowanie i formuly na kolumnie daty przestaja dzialac, a przy odczycie
 * wracalby tekst zamiast wartosci.
 */

export function dateToSerial(isoDate: string): number {
    const [year, month, day] = isoDate.split('-').map(Number);
    return Math.round(
        (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000
    );
}

export function serialToMonthKey(serial: number): string {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
