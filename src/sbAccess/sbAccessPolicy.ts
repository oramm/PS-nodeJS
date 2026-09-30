import { SystemRoleName } from '../types/sessionTypes';
import { SbAccessResult, SbAccessStatus } from './sbAccessTypes';

/**
 * Reguły modułu dostępu do Second Brain (plan SB.RDZEN.01 "Instalator SB bez błądzenia", B3).
 * Czyste funkcje i stałe, bez I/O - kontroler pyta tu "czy wolno", a sam wykonuje wywołania.
 */

/** Organizacja GitHub z repozytoriami SB; członkostwo = odczyt kanonu. */
export const SB_GITHUB_ORG = 'envi-konsulting';

/** Dysk współdzielony SB.ENVI (korzeń). Stała, bo zmiana dysku to zmiana modułu, nie środowiska. */
export const SB_DRIVE_ID = '0AH3vXVwNH5M-Uk9PVA';

/** Rola nadawana na SB.ENVI: czytelnik (decyzja D3, konsumenci = przeglądający). */
export const SB_DRIVE_ROLE = 'reader';

/**
 * Kogo wolno zaprosić do SB (decyzja D2). Poszerzenie, np. o współpracowników,
 * to dopisanie roli tutaj - nigdzie indziej ta lista nie jest powtarzana.
 */
export const SB_INVITABLE_ROLES: SystemRoleName[] = [
    SystemRoleName.ENVI_EMPLOYEE,
    SystemRoleName.ENVI_MANAGER,
];

/**
 * Kto zarządza dostępem: rola z tej listy I znacznik StaffMembers.CanManageSbAccess.
 * Sama rola nie wystarcza (plan: "admin albo kierownik z uprawnieniem w PS"), także ADMIN
 * potrzebuje znacznika. Ścieżka naprawy nie ginie: znacznik ustawia panel administracyjny,
 * który stoi na samej roli (adminPanelGuard).
 */
export const SB_MANAGER_ROLES: SystemRoleName[] = [
    SystemRoleName.ADMIN,
    SystemRoleName.ENVI_MANAGER,
];

export const SB_GITHUB_TOKEN_ENV = 'SB_GITHUB_INVITE_TOKEN';

/** Błąd, który zna swój status HTTP; router odpowiada nim wprost (bez maila-raportu). */
export class SbAccessError extends Error {
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message);
        this.name = 'SbAccessError';
    }
}

export const NOT_CONFIGURED_MESSAGE =
    'Funkcja nieskonfigurowana: serwer nie ma tokenu GitHub do zapraszania do SB. Nic nie zostało zmienione.';

type Operation = 'INVITE' | 'BLOCK' | 'UNBLOCK' | 'REVOKE';

/**
 * Z jakiego stanu wolno wykonać operację. `null` = osoba bez wpisu w rejestrze.
 *
 * - INVITE z INVITED jest dozwolone celowo: to "dokończ zaproszenie" po częściowym
 *   sukcesie; wywołania zewnętrzne same sprawdzają, co już jest, więc nic się nie dubluje.
 * - BLOCK z BLOCKED i REVOKE z REVOKED - to samo: powtórka dokańcza zdjęcie tego,
 *   czego poprzednio nie udało się zdjąć (404 = już zdjęte).
 * - Z REVOKED nie ma odblokowania; ponowne dopuszczenie = nowe zaproszenie.
 */
const ALLOWED_FROM: Record<Operation, (SbAccessStatus | null)[]> = {
    INVITE: [null, 'INVITED', 'REVOKED'],
    BLOCK: ['INVITED', 'ACTIVE', 'BLOCKED'],
    UNBLOCK: ['BLOCKED'],
    REVOKE: ['INVITED', 'ACTIVE', 'BLOCKED', 'REVOKED'],
};

const REFUSAL: Record<Operation, Partial<Record<SbAccessStatus | 'NONE', string>>> = {
    INVITE: {
        ACTIVE: 'Osoba ma już aktywny dostęp do SB.',
        BLOCKED: 'Dostęp jest zablokowany - użyj odblokowania.',
    },
    BLOCK: {
        NONE: 'Osoba nie ma dostępu do SB.',
        REVOKED: 'Dostęp został odebrany na stałe.',
    },
    UNBLOCK: {
        NONE: 'Osoba nie ma dostępu do SB.',
        INVITED: 'Dostęp nie jest zablokowany. Aby uzupełnić zaproszenie, użyj zaproszenia.',
        ACTIVE: 'Dostęp nie jest zablokowany.',
        REVOKED: 'Dostęp został odebrany na stałe - ponowne dopuszczenie to nowe zaproszenie.',
    },
    REVOKE: {
        NONE: 'Osoba nie ma dostępu do SB.',
    },
};

export function assertOperationAllowed(
    operation: Operation,
    status: SbAccessStatus | null,
    isGrantedManually: boolean,
): void {
    if (
        isGrantedManually &&
        (operation === 'BLOCK' || operation === 'REVOKE' || operation === 'UNBLOCK')
    )
        throw new SbAccessError(
            409,
            'Ten dostęp nadano ręcznie przed uruchomieniem modułu - moduł go nie zdejmuje ani nie przywraca. Zmień go ręcznie na GitHubie i na Dysku.',
        );
    if (ALLOWED_FROM[operation].includes(status)) return;
    throw new SbAccessError(
        409,
        REFUSAL[operation][status ?? 'NONE'] ??
            'Tej operacji nie można wykonać w obecnym stanie dostępu.',
    );
}

/** Wynik jednej części operacji (GitHub albo Dysk). */
export interface PartOutcome {
    ok: boolean;
    note: string;
}

export function combineResult(parts: PartOutcome[]): SbAccessResult {
    const okCount = parts.filter((part) => part.ok).length;
    if (okCount === parts.length) return 'OK';
    return okCount === 0 ? 'FAILED' : 'PARTIAL';
}

/** Loginy GitHub: 1-39 znaków, litery/cyfry i pojedyncze myślniki, nie na brzegach. */
export const GITHUB_LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

const MAX_NOTE_LENGTH = 1000;

/**
 * Uwaga do historii: bez tokenów (defensywnie wycina wszystko, co wygląda na token
 * GitHub lub Google), przycięta. Treść błędów API zwykle tokenów nie zawiera - to druga linia.
 */
export function sanitizeNote(note: string): string {
    return note
        .replace(/\b(gh[pousr]_|github_pat_)[A-Za-z0-9_]+/g, '[ukryto]')
        .replace(/\bya29\.[A-Za-z0-9._-]+/g, '[ukryto]')
        .replace(/\b1\/\/[A-Za-z0-9._-]{20,}/g, '[ukryto]')
        .slice(0, MAX_NOTE_LENGTH);
}
