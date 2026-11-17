import { SbAccessError } from './sbAccessPolicy';
import { SbHealthReport, SbHealthSummary, SbHealthTool } from './sbAccessTypes';

/**
 * Raport zdrowia instalacji SB (plan SBD, SBD-4a). Czyste funkcje, bez I/O.
 *
 * Instalator na komputerze pracownika raz dziennie wysyła: wersje, stan narzędzi (działa/błąd
 * z krótkim opisem) i kilka linii logu. BIAŁA LISTA: z ciała żądania czytamy wyłącznie pola
 * poniżej; wszystko inne jest ignorowane i nigdy nie trafia do bazy. Długości są przycinane,
 * data raportu to czas serwera (nie z żądania).
 */

/** JEDYNE miejsce reguły "raport starszy niż 7 dni jest szary" (ekran dostaje gotowe `stale`). */
export const SB_HEALTH_STALE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export const SB_HEALTH_MAX_TOOLS = 30;
export const SB_HEALTH_MAX_EVENTS = 20;
export const SB_HEALTH_MAX_LINE = 200;
const MAX_VERSION = 30;
const TOOL_NAME = /^[a-z0-9-]{1,40}$/;
/** Surowy tekst przycinamy przed maskowaniem, żeby wyrażenia regularne nie pracowały na megabajtach. */
const RAW_LIMIT = 1000;

/**
 * Wartości wyglądające na sekret są maskowane, nie zapisywane: (1) znane prefiksy tokenów
 * (GitHub, Google), (2) każdy ciąg dłuższy niż 40 znaków z alfabetu base64/base64url/hex
 * (klucze, tokeny, szyfrogramy). Reguła jest prosta i celowo zachowawcza - wolimy zamazać
 * długi identyfikator niż zapisać hasło. Maskowanie idzie PRZED przycięciem długości, żeby
 * ucięty sekret nie został w części.
 */
const SECRET_LIKE: RegExp[] = [
    /\b(gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g,
    /\bya29\.[A-Za-z0-9._-]+/g,
    /\b1\/\/[A-Za-z0-9._-]{20,}/g,
    /[A-Za-z0-9+/=_-]{41,}/g,
];
const MASK = '[ukryto]';

/** Krótki tekst: bez znaków sterujących, sekretopodobne fragmenty zamaskowane, przycięty. */
export function sanitizeHealthText(raw: unknown, maxLength: number): string | null {
    if (typeof raw !== 'string') return null;
    let text = raw.slice(0, RAW_LIMIT).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
    for (const pattern of SECRET_LIKE) text = text.replace(pattern, MASK);
    text = text.slice(0, maxLength).trim();
    return text || null;
}

function parseTool(raw: any): SbHealthTool | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (typeof raw.name !== 'string' || !TOOL_NAME.test(raw.name)) return null;
    if (typeof raw.ok !== 'boolean') return null;
    if (raw.ok) return { name: raw.name, ok: true };
    // Błąd bez opisu też jest błędem: ekran pokaże narzędzie jako niedziałające.
    const error = sanitizeHealthText(raw.error, SB_HEALTH_MAX_LINE);
    return error ? { name: raw.name, ok: false, error } : { name: raw.name, ok: false };
}

/**
 * Biała lista raportu. 400 tylko wtedy, gdy ciało nie ma sensu (nie obiekt, brak tablicy
 * `tools`); pojedyncze złe pozycje są pomijane, nadmiar ucinany.
 */
export function parseHealthReport(raw: unknown): SbHealthReport {
    const body = raw as any;
    if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.tools))
        throw new SbAccessError(400, 'Nieprawidłowy raport (wymagana lista narzędzi).');
    const tools: SbHealthTool[] = [];
    for (const item of body.tools.slice(0, SB_HEALTH_MAX_TOOLS)) {
        const tool = parseTool(item);
        if (tool && !tools.some((known) => known.name === tool.name)) tools.push(tool);
    }
    const events = (Array.isArray(body.events) ? body.events.slice(0, SB_HEALTH_MAX_EVENTS) : [])
        .map((line: unknown) => sanitizeHealthText(line, SB_HEALTH_MAX_LINE))
        .filter((line: string | null): line is string => !!line);
    return {
        sbVersion: sanitizeHealthText(body.sbVersion, MAX_VERSION),
        installerVersion: sanitizeHealthText(body.installerVersion, MAX_VERSION),
        tools,
        events,
    };
}

export function isHealthStale(reportedAt: Date, now: Date = new Date()): boolean {
    return now.getTime() - reportedAt.getTime() > SB_HEALTH_STALE_DAYS * DAY_MS;
}

/** Podsumowanie do listy: stan ok/fail z narzędzi, szarość z wieku, prośba oczekująca. */
export function summarizeHealth(
    report: SbHealthReport,
    reportedAt: Date,
    refreshRequestedAt: Date | null,
    now: Date = new Date(),
): SbHealthSummary {
    return {
        ...report,
        reportedAt,
        state: report.tools.every((tool) => tool.ok) ? 'ok' : 'fail',
        stale: isHealthStale(reportedAt, now),
        refreshRequested: !!refreshRequestedAt,
    };
}

/** Wartość kolumny JSON z bazy (tekst albo obiekt) z powrotem na raport; uszkodzony = brak raportu. */
export function healthReportFromDb(raw: unknown): SbHealthReport | null {
    if (raw == null) return null;
    try {
        return parseHealthReport(typeof raw === 'string' ? JSON.parse(raw) : raw);
    } catch {
        return null;
    }
}

/** Nazwa pliku raportu do pobrania: tylko ASCII, nazwisko i data (RRRR-MM-DD). */
export function healthReportFileName(surname: string, reportedAt: Date): string {
    const ascii = surname
        .replace(/ł/g, 'l').replace(/Ł/g, 'L')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `raport-sb-${ascii || 'osoba'}-${reportedAt.toISOString().slice(0, 10)}.json`;
}
