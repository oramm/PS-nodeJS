import SbDriveGateway from './SbDriveGateway';
import { AGENT_ADMINISTRATOR, AgentRouteAccess, agentRoutesFor } from '../setup/Sessions/agentRouteTable';
import { PersonMailbox } from '../mailboxes/mailboxAccessPolicy';
import { SbAccessLevels, SbAccessStatus, SbHealthTool } from './sbAccessTypes';

/**
 * AGD-2 — mapa "co ma agent osoby, czego nie ma i kogo poprosić" (plan AGD, T4). Jedna funkcja dla
 * komputera osoby (GET /sbAccess/me/agentAccess -> blok SB-DOSTEPY, AGD-3) i ekranu Dostępy SB.
 * Bez haseł, tokenów, kluczy i kwot: wynik składa się wyłącznie z pól budowanych tutaj.
 */

export type AgentAccessState = 'ma' | 'nie ma' | 'agent tego nie robi';
export type AgentAccessSystem =
    | 'psRead' | 'psWrite' | 'drive' | 'mail' | 'costInvoices' | 'fin' | 'fidman' | 'tar' | 'aqm' | 'sbRepos';

export interface AgentAccessEntry {
    system: AgentAccessSystem;
    label: string;
    state: AgentAccessState;
    /** Zdanie dla osoby, które agent może powtórzyć dosłownie (z "kogo poprosić", gdy trzeba). */
    sentence: string;
    /** Kogo poprosić (imię i nazwisko); pusto, gdy prosić nie trzeba. */
    askWhom: string[];
    details?: Record<string, unknown>;
}

export interface AgentAccessMap {
    personId: number;
    person: string;
    generatedAt: string;
    administrator: string;
    systems: AgentAccessEntry[];
    psRoutes: {
        level: SbAccessLevels['psDb'];
        counts: Record<AgentRouteAccess, number>;
        /** Ile tras agent tej osoby może dziś wywołać (0, gdy nie wchodzi do PS). */
        allowed: number;
        routes: { method: string; path: string; access: AgentRouteAccess; reason: string; allowed: boolean }[];
    };
}

/** Dyski, na których leżą pisma, projekty, kontrakty i oferty (odczyt Drive API 2026-11-19). */
export const AGENT_DRIVES = [
    { id: '0AFGVqb32NbAaUk9PVA', label: 'PS.ENVI' },
    { id: '0AFUzWz_2xNGkUk9PVA', label: 'PS.ENVI (otmuchow, przeworno, strzelin, zywiec)' },
    { id: '0AC4al_OPBaG2Uk9PVA', label: 'Biuro' },
] as const;
/** Foldery ENVI-MG otwarte pracownikom do odczytu w AGD-5 (porcja 1). */
export const ENVI_MG_FOLDERS = [
    { id: '1I3bGmvdU5EiwNFNlqCUbRc3c6kRt6pSy', label: 'ENV.PROC procedury' },
    { id: '1dyc1j8csw8ZULpGhQUoMmF0FK6RdF8OT', label: 'wzorce dokumentów firmowych' },
    { id: '1R7cPzeD8_mYmtAG3DqORSLgh7LlvECWZ', label: 'ENV.PT Wzory i dokumenty' },
    { id: '1Zms6ZI494oSFbG3wbpAUiaEPJ-JvXlDi', label: 'ENV.PROMO Materiały promocyjne' },
    { id: '1rbbPhju8KVl-Kq9MaUzYjx2JHifxMS8s', label: 'Zdjęcia stock reklama' },
] as const;

export interface DriveMembership {
    drives: string[];
    envMgFolders: string[];
}

export interface AgentAccessInput {
    personId: number;
    person: string;
    statusCode: SbAccessStatus;
    levels: SbAccessLevels;
    githubLinked: boolean;
    hasAgentKey: boolean;
    hasCostInvoiceAccess: boolean;
    finEnabled: boolean;
    fidmanEnabled: boolean;
    mailboxes: PersonMailbox[];
    /** Kto nadaje poziomy na ekranie Dostępy SB (rola kierownicza + znacznik zarządzania). */
    sbManagers: string[];
    /** Kto zmienia znaczniki w "Personel i uprawnienia" (role panelu administracyjnego). */
    accountManagers: string[];
    /** Pozycja dysk-google z ostatniego raportu zdrowia; null = jej nie było. */
    driveTool: SbHealthTool | null;
    googleAccount: string | null;
    /** null = PS nie sprawdził członkostwa (błąd Dysku). */
    drive: DriveMembership | null;
    now?: Date;
}

const ask = (names: string[]) => `Kogo poprosić: ${names.join(', ')}.`;
const askAdmin = `Zgłoś się do administratora: ${AGENT_ADMINISTRATOR}.`;

export function agentAccessMap(input: AgentAccessInput): AgentAccessMap {
    const sbAsk = input.sbManagers.length ? input.sbManagers : [AGENT_ADMINISTRATOR];
    const accountAsk = input.accountManagers.length ? input.accountManagers : [AGENT_ADMINISTRATOR];
    const psDb = input.levels.psDb;
    const entry = (system: AgentAccessSystem, label: string, state: AgentAccessState, sentence: string, askWhom: string[] = [], details?: Record<string, unknown>): AgentAccessEntry =>
        ({ system, label, state, sentence, askWhom, ...(details && { details }) });

    // Klucz agenta działa tylko przy wpisie ACTIVE (sbAgentKeyAuth); INVITED = 401 "To moje konto".
    const sbBlocker = input.statusCode === 'ACTIVE' ? null
        : input.statusCode === 'INVITED'
            ? 'dostęp do Second Brain czeka na potwierdzenie „To moje konto” na stronie Second Brain w PS'
            : 'dostęp do Second Brain jest zablokowany albo odebrany';
    const psBlocker = sbBlocker
        ?? (psDb === 'none' ? 'na ekranie Dostępy SB masz „baza PS: brak”' : null)
        ?? (input.hasAgentKey ? null : 'komputer nie zarejestrował jeszcze klucza agenta w PS (uruchom ponownie instalator Second Brain)');
    const psWorks = !psBlocker;

    const routes = agentRoutesFor(psDb === 'rw' ? 'rw' : 'ro').map((r) => ({ ...r, allowed: psWorks && r.allowed }));
    const counts = { odczyt: 0, zapis: 0, zamkniete: 0 } as Record<AgentRouteAccess, number>;
    for (const r of routes) counts[r.access]++;
    const allowed = routes.filter((r) => r.allowed).length;

    const psRead = psWorks
        ? entry('psRead', 'baza PS (odczyt)', 'ma', `Agent czyta PS: ${counts.odczyt} tras odczytu i baza PS do odczytu.`)
        : entry('psRead', 'baza PS (odczyt)', 'nie ma', `Agent nie ma dostępu do PS: ${psBlocker}. ${ask(sbAsk)}`, sbAsk);
    const psWrite = !psWorks
        ? entry('psWrite', 'PS (zapis)', 'nie ma', `Agent nie zapisze nic w PS: ${psBlocker}. ${ask(sbAsk)}`, sbAsk)
        : psDb === 'rw'
            ? entry('psWrite', 'PS (zapis)', 'ma', `Agent zapisuje w PS w Twoim imieniu: ${counts.zapis} tras zapisu; ${counts.zamkniete} tras jest dla agenta zamkniętych.`)
            : entry('psWrite', 'PS (zapis)', 'nie ma', `Agent ma w PS tylko odczyt (Dostępy SB: „baza PS: odczyt”). O „baza PS: zapis” poproś. ${ask(sbAsk)}`, sbAsk);

    return {
        personId: input.personId,
        person: input.person,
        generatedAt: (input.now ?? new Date()).toISOString(),
        administrator: AGENT_ADMINISTRATOR,
        systems: [
            psRead,
            psWrite,
            driveEntry(input),
            input.mailboxes.length
                ? entry('mail', 'poczta', 'ma', `Agent ma skrzynki: ${input.mailboxes.map((m) => m.address).join(', ')}.`, [],
                    { mailboxes: input.mailboxes.map(({ code, address, source }) => ({ code, address, source })) })
                : entry('mail', 'poczta', 'nie ma', `Agent nie ma żadnej skrzynki poczty. Skrzynki dają przypisania do projektów w PS albo ekran Dostępy SB. ${ask(sbAsk)}`, sbAsk, { mailboxes: [] }),
            !input.hasCostInvoiceAccess
                ? entry('costInvoices', 'faktury kosztowe', 'nie ma', `Nie masz znacznika „Faktury kosztowe” (Personel i uprawnienia), więc agent ich nie czyta. ${ask(accountAsk)}`, accountAsk)
                : psWorks
                    ? entry('costInvoices', 'faktury kosztowe', 'ma', 'Agent czyta faktury kosztowe przez PS (znacznik „Faktury kosztowe”).')
                    : entry('costInvoices', 'faktury kosztowe', 'nie ma', `Masz znacznik „Faktury kosztowe”, ale agent nie wchodzi do PS: ${psBlocker}. ${ask(sbAsk)}`, sbAsk),
            !input.finEnabled
                ? entry('fin', 'FIN', 'nie ma', `Nie masz znacznika „Użytkownik FIN” (Personel i uprawnienia), więc agent nie pracuje w FIN. ${ask(accountAsk)}`, accountAsk)
                : sbBlocker || !input.hasAgentKey
                    ? entry('fin', 'FIN', 'nie ma', `Masz konto FIN, ale klucz agenta nie działa: ${sbBlocker ?? 'komputer nie zarejestrował jeszcze klucza agenta (uruchom ponownie instalator Second Brain)'}. ${ask(sbAsk)}`, sbAsk)
                    : entry('fin', 'FIN', 'ma', 'Agent pracuje w FIN tym samym kluczem co w PS (znacznik „Użytkownik FIN”).'),
            entry('fidman', 'FIDman', 'agent tego nie robi',
                'Agent nie ma narzędzia do FIDmana i nie zrobi tam nic za Ciebie; pracujesz w aplikacji FIDman. '
                + (input.fidmanEnabled ? 'Masz konto FIDmana nadane z PS.' : `Nie masz konta FIDmana nadanego z PS (znacznik „Użytkownik FIDmana”, Personel i uprawnienia). ${ask(accountAsk)}`),
                input.fidmanEnabled ? [] : accountAsk, { hasAccount: input.fidmanEnabled }),
            // Kanon dostępów: kto nadaje dostęp do TAR i konta ENVI w AQM - nie ustalono.
            entry('tar', 'aplikacja taryfowa (TAR)', 'agent tego nie robi',
                `Agent nie ma narzędzia do aplikacji taryfowej i nie zrobi tam nic za Ciebie; pracujesz w samej aplikacji. Kto nadaje do niej dostęp, nie ustalono. ${askAdmin}`, [AGENT_ADMINISTRATOR]),
            entry('aqm', 'e-Aquamatic (AQM)', 'agent tego nie robi',
                `Agent nie ma narzędzia do e-Aquamatic i nie zrobi tam nic za Ciebie; pracujesz w samej aplikacji. Kto prowadzi konta ENVI w AQM, nie ustalono. ${askAdmin}`, [AGENT_ADMINISTRATOR]),
            reposEntry(input, sbBlocker, sbAsk),
        ],
        psRoutes: { level: psDb, counts, allowed, routes },
    };
}

function reposEntry(input: AgentAccessInput, sbBlocker: string | null, sbAsk: string[]): AgentAccessEntry {
    const base = { system: 'sbRepos' as const, label: 'repozytoria Second Brain' };
    if (sbBlocker) return { ...base, state: 'nie ma', sentence: `Agent nie ma repozytoriów Second Brain: ${sbBlocker}. ${ask(sbAsk)}`, askWhom: sbAsk };
    if (input.levels.repos === 'none')
        return { ...base, state: 'nie ma', sentence: `Agent nie ma repozytoriów Second Brain (Dostępy SB: „repozytoria: brak”). ${ask(sbAsk)}`, askWhom: sbAsk };
    if (!input.githubLinked)
        return { ...base, state: 'nie ma', sentence: `Twoje konto GitHub nie jest przypisane w Dostępach SB, więc repozytoria nie działają. ${ask(sbAsk)}`, askWhom: sbAsk };
    return {
        ...base,
        state: 'ma',
        sentence: input.levels.repos === 'write' ? 'Agent czyta i zapisuje repozytoria Second Brain.' : 'Agent czyta repozytoria Second Brain (bez zapisu).',
        askWhom: [],
    };
}

/**
 * Dysk liczy się z rzeczywistości, nie z poziomu "Dysk" na ekranie (ten niczego nie włącza): agent
 * czyta Dysk kontem Google osoby, więc liczy się członkostwo tego konta i stan skryptu z raportu.
 */
function driveEntry(input: AgentAccessInput): AgentAccessEntry {
    const base = { system: 'drive' as const, label: 'Dysk Google' };
    const script = !input.driveTool ? 'nieznany' : input.driveTool.ok ? 'dziala' : 'blad';
    const details = {
        account: input.googleAccount,
        accountSource: input.driveTool?.account ? 'raport komputera' : 'konto PS',
        drives: input.drive?.drives ?? null,
        envMgFolders: input.drive ? { readable: input.drive.envMgFolders.length, total: ENVI_MG_FOLDERS.length } : null,
        script,
    };
    if (script === 'blad')
        return { ...base, state: 'nie ma', details, askWhom: [AGENT_ADMINISTRATOR],
            sentence: `Skrypt Google agenta na Twoim komputerze zgłosił błąd${input.driveTool!.error ? ` (${input.driveTool!.error})` : ''}. Zaloguj go ponownie (instalator Second Brain); jeśli to nie pomoże: ${askAdmin}` };
    if (!input.googleAccount)
        return { ...base, state: 'nie ma', details, askWhom: [AGENT_ADMINISTRATOR],
            sentence: `PS nie zna Twojego konta Google, więc nie wie, czy agent dojdzie do Dysku. ${askAdmin}` };
    if (input.drive && !input.drive.drives.length)
        return { ...base, state: 'nie ma', details, askWhom: [AGENT_ADMINISTRATOR],
            sentence: `Konto Google ${input.googleAccount} nie jest członkiem dysków z pismami, projektami i ofertami (${AGENT_DRIVES.map((d) => d.label).join(', ')}). Członkostwo dysków prowadzi właściciel. ${askAdmin}` };
    const where = input.drive
        ? `członek ${input.drive.drives.join(', ')}; procedury i wzory ENVI-MG: ${input.drive.envMgFolders.length} z ${ENVI_MG_FOLDERS.length} folderów`
        : 'członkostwa dysków PS teraz nie sprawdził (błąd połączenia z Dyskiem)';
    const scriptText = script === 'dziala' ? 'skrypt działa' : 'stan skryptu nieznany (komputer nie przysłał jeszcze raportu o skrypcie Google)';
    return { ...base, state: 'ma', details, askWhom: [], sentence: `Agent czyta Dysk Twoim kontem Google ${input.googleAccount}: ${where}; ${scriptText}.` };
}

// shortcut: członkowie dysków i folderów trzymani w procesie 15 min (komputery pytają co godzinę); grupy Google pomijane - gdy dostęp pójdzie przez grupy, trzeba rozwinąć członków grupy.
const MEMBERS_TTL_MS = 15 * 60 * 1000;
let membersCache: { at: number; members: Promise<Map<string, Set<string>>> } | undefined;

function allMembers(now: number): Promise<Map<string, Set<string>>> {
    if (!membersCache || now - membersCache.at > MEMBERS_TTL_MS) {
        const members = Promise.all(
            [...AGENT_DRIVES, ...ENVI_MG_FOLDERS].map(async ({ id }) => [id, await SbDriveGateway.listUserEmails(id)] as const),
        ).then((pairs) => new Map(pairs));
        membersCache = { at: now, members };
        // Błąd nie zostaje w pamięci: następne pytanie spróbuje ponownie.
        members.catch(() => { if (membersCache?.members === members) membersCache = undefined; });
    }
    return membersCache.members;
}

/** Członkostwo konta Google w dyskach i folderach mapy; null = Dysk nie odpowiedział. */
export async function driveMembership(account: string, now = Date.now()): Promise<DriveMembership | null> {
    try {
        const members = await allMembers(now);
        const has = (id: string) => members.get(id)?.has(account.toLowerCase()) ?? false;
        return {
            drives: AGENT_DRIVES.filter((d) => has(d.id)).map((d) => d.label),
            envMgFolders: ENVI_MG_FOLDERS.filter((f) => has(f.id)).map((f) => f.label),
        };
    } catch (error) {
        console.error('[SbAccess] mapa dostępów: odczyt członków Dysku nie powiódł się:', error);
        return null;
    }
}

export function resetDriveMembersCache(): void {
    membersCache = undefined;
}
