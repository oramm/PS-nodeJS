/**
 * Czyste funkcje dat dla urlopów (bez I/O). Operujemy na łańcuchach 'YYYY-MM-DD',
 * konstruując Date w czasie LOKALNYM (new Date(y, m-1, d)), żeby uniknąć przesunięć
 * stref czasowych typowych dla parsowania ISO. Świąt NIE uwzględniamy - liczą się
 * tylko dni robocze pon-pt (decyzja biznesowa).
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Waliduje i normalizuje 'YYYY-MM-DD' (odrzuca daty nieistniejące, np. 2026-02-31). */
export function parseDateOnly(value: unknown, field = 'data'): string {
    if (typeof value !== 'string' || !DATE_RE.test(value))
        throw new Error(`Nieprawidłowy format pola ${field} (oczekiwano YYYY-MM-DD)`);
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (
        date.getFullYear() !== y ||
        date.getMonth() !== m - 1 ||
        date.getDate() !== d
    )
        throw new Error(`Nieprawidłowa data w polu ${field}: ${value}`);
    return value;
}

/**
 * Normalizuje wartość kolumny DATE z bazy do 'YYYY-MM-DD'. Pool ma timezone '+00:00',
 * więc DATE wraca jako Date o północy UTC → bezpieczny toISOString().slice(0,10).
 * Obsługuje też przypadek, gdy sterownik zwróci już string.
 */
export function dbDateToStr(value: unknown): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'string') return value.slice(0, 10);
    return String(value);
}

/** Date (czas lokalny) z 'YYYY-MM-DD'. */
export function toDate(dateStr: string): Date {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/** 'YYYY-MM-DD' z Date (czas lokalny). */
export function toDateStr(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** true dla soboty/niedzieli. */
export function isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6;
}

/**
 * Liczba dni roboczych (pon-pt) w zakresie [fromStr, toStr] włącznie.
 * Zwraca 0 gdy zakres pusty/odwrócony.
 */
export function countWeekdays(fromStr: string, toStr: string): number {
    const from = toDate(fromStr);
    const to = toDate(toStr);
    if (to < from) return 0;
    let count = 0;
    const cursor = new Date(from);
    while (cursor <= to) {
        if (!isWeekend(cursor)) count++;
        cursor.setDate(cursor.getDate() + 1);
    }
    return count;
}

/**
 * Liczba dni roboczych nieobecności [fromStr, toStr] przypadających w części wspólnej
 * z oknem [windowFrom, windowTo]. Używane do rozliczeń rocznych/tygodniowych,
 * gdy urlop wykracza poza okno.
 */
export function countWeekdaysInWindow(
    fromStr: string,
    toStr: string,
    windowFrom: string,
    windowTo: string
): number {
    const start = fromStr > windowFrom ? fromStr : windowFrom;
    const end = toStr < windowTo ? toStr : windowTo;
    if (end < start) return 0;
    return countWeekdays(start, end);
}

/** Poniedziałek tygodnia zawierającego podaną datę (tydzień pon-pt). */
export function mondayOf(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay();
    const diff = day === 0 ? -6 : 1 - day; // niedziela => cofnij do poprzedniego pon
    result.setDate(result.getDate() + diff);
    return result;
}

/**
 * Okna dat (pon-pt) dla tygodnia poprzedniego, bieżącego i następnego względem `today`.
 * Zwraca krotki [from, to] jako 'YYYY-MM-DD' (from=pon, to=pt).
 */
export function prevCurrentNextWeekWindows(today: Date): {
    prev: [string, string];
    current: [string, string];
    next: [string, string];
} {
    const currentMon = mondayOf(today);
    const makeWindow = (weekOffset: number): [string, string] => {
        const mon = new Date(currentMon);
        mon.setDate(mon.getDate() + weekOffset * 7);
        const fri = new Date(mon);
        fri.setDate(fri.getDate() + 4);
        return [toDateStr(mon), toDateStr(fri)];
    };
    return {
        prev: makeWindow(-1),
        current: makeWindow(0),
        next: makeWindow(1),
    };
}

// ---------------------------------------------------------------------------
// Nieobecność na część dnia. Jednostką rachunku są MINUTY (liczby całkowite),
// nie ułamki dnia: rachunek na ułamkach dryfuje (0,1 + 0,2 = 0,30000000000000004),
// a sprawdzanie puli to porównanie "wykorzystane + żądane > pula" - dryf o jedną
// milionową odrzuciłby poprawny wniosek komunikatem o braku dni.
// Na dni przelicza się dopiero przy wyświetleniu i przy zapisie kolumny.
// ---------------------------------------------------------------------------

/** Ile minut pracy ma pełny dzień. Stała biznesowa (8 h = 1 dzień), decyzja ownera. */
export const MINUTES_PER_DAY = 480;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Waliduje i normalizuje 'HH:MM' (przyjmuje też 'HH:MM:SS' z bazy). */
export function parseTimeOnly(value: unknown, field = 'godzina'): string {
    const candidate = typeof value === 'string' ? value.trim().slice(0, 5) : '';
    if (!TIME_RE.test(candidate))
        throw new Error(`Nieprawidłowy format pola ${field} (oczekiwano HH:MM)`);
    return candidate;
}

/** Normalizuje kolumnę TIME z bazy do 'HH:MM'; NULL zostaje nullem. */
export function dbTimeToStr(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) return value.toISOString().slice(11, 16);
    return String(value).slice(0, 5);
}

/** Minuty od północy dla 'HH:MM'. */
export function timeToMinutes(hhmm: string): number {
    const [hours, minutes] = hhmm.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Minuty pracy nieobecności. Cały dzień (godziny puste) = dni robocze * 480.
 * Część dnia = różnica "do" minus "od"; z definicji mieści się w jednym dniu roboczym,
 * więc dzień nieroboczy daje zero (walidator i tak takiego wpisu nie przepuszcza).
 */
export function countWorkMinutes(
    fromStr: string,
    toStr: string,
    startTime?: string | null,
    endTime?: string | null
): number {
    if (startTime && endTime)
        return countWeekdays(fromStr, toStr) > 0
            ? timeToMinutes(endTime) - timeToMinutes(startTime)
            : 0;
    return countWeekdays(fromStr, toStr) * MINUTES_PER_DAY;
}

/** Jak countWorkMinutes, ale tylko w części wspólnej z oknem [windowFrom, windowTo]. */
export function countWorkMinutesInWindow(
    fromStr: string,
    toStr: string,
    startTime: string | null | undefined,
    endTime: string | null | undefined,
    windowFrom: string,
    windowTo: string
): number {
    if (startTime && endTime) {
        // część dnia stoi w jednym dniu, więc albo wpada w okno w całości, albo wcale
        if (fromStr < windowFrom || fromStr > windowTo) return 0;
        return countWorkMinutes(fromStr, toStr, startTime, endTime);
    }
    return (
        countWeekdaysInWindow(fromStr, toStr, windowFrom, windowTo) *
        MINUTES_PER_DAY
    );
}

/** Minuty na dni - do prezentacji i do kolumny DECIMAL(5,2). Całe dni zostają całe. */
export function minutesToDays(minutes: number): number {
    return Math.round((minutes / MINUTES_PER_DAY) * 100) / 100;
}

/** Dni (także ułamkowe pule z bazy) na minuty. 0,1 dnia = 48 min, zawsze całkowite. */
export function daysToMinutes(days: number): number {
    return Math.round(days * MINUTES_PER_DAY);
}

/** Liczba dni po polsku: przecinek, do dwóch miejsc, bez końcowych zer ("1,5", "26"). */
export function formatDays(days: number): string {
    return String(Math.round(days * 100) / 100).replace('.', ',');
}

const MONTHS_GENITIVE = [
    'stycznia',
    'lutego',
    'marca',
    'kwietnia',
    'maja',
    'czerwca',
    'lipca',
    'sierpnia',
    'września',
    'października',
    'listopada',
    'grudnia',
];

/**
 * Termin nieobecności po ludzku, do komunikatów błędu:
 * "18 września", "14-16 września", "28 września - 3 października".
 */
export function formatAbsenceTerm(fromStr: string, toStr: string): string {
    const from = toDate(fromStr);
    const to = toDate(toStr);
    const monthFrom = MONTHS_GENITIVE[from.getMonth()];
    const monthTo = MONTHS_GENITIVE[to.getMonth()];
    if (fromStr === toStr) return `${from.getDate()} ${monthFrom}`;
    if (from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear())
        return `${from.getDate()}–${to.getDate()} ${monthTo}`;
    return `${from.getDate()} ${monthFrom} – ${to.getDate()} ${monthTo}`;
}
