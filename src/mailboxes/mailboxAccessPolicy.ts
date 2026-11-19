import { contractMemberIds, MembershipEdge, projectMemberIds } from '../persons/projectAssignments/projectMembership';
import { SystemRoleName } from '../types/sessionTypes';

/**
 * Role, które nie dostają poczty projektu z przypisania (MBX: pracownik wykonawcy i klient)
 * ani pokoju Google Chat z przypisania (ChatSpacesController - ta sama granica)
 * i których edycja kontraktu nie przyjmuje jako osoby dodatkowej (ContractSelectedPersonsRepository.validate).
 * Celowo węższe niż PROJECT_SCOPED_ROLES ("kto jest ograniczony do przypisań"):
 * współpracownik jest ograniczony, ale pocztę przypisanych projektów ma (plan DOSTEP, D7).
 */
export const NO_PROJECT_MAIL_ROLES: SystemRoleName[] = [SystemRoleName.CONTRACT_WORKER, SystemRoleName.CLIENT];

/** Role, które mają każdą skrzynkę projektu i kontraktu oraz ogólnofirmowe "wszyscy pracownicy" (plan SKO, K1). */
export const ALL_PROJECT_MAIL_ROLES: SystemRoleName[] = [SystemRoleName.ADMIN, SystemRoleName.ENVI_MANAGER, SystemRoleName.ENVI_EMPLOYEE];

/** Właściciel skrzynki: projekt (contractId null) albo kontrakt; ogólnofirmowa = oba null. */
export interface MailboxOwnerRow {
    code: string;
    address: string;
    projectOurId: string | null;
    contractId: number | null;
    /** Ogólnofirmowa dla wszystkich pracowników (SKO); brak = wskazane osoby. */
    allEmployees?: boolean;
    /** null albo brak = PS nie zna hasła (skrzynka niezarządzana, SKO-2). */
    passwordVersion?: number | null;
}

/** Skrzynka i jedna osoba do niej przypisana (brak przypisanych = jeden wiersz z null). */
export interface MailboxAssigneeRow {
    code: string;
    address: string;
    personId: number | null;
    /** Skrzynka projektu albo kontraktu. */
    owned?: boolean;
    allEmployees?: boolean;
    passwordVersion?: number | null;
}

/**
 * Kto jest przypisany do skrzynki - wprost z reguły projectMembership: skrzynka projektu = osoby
 * projektu (każdy kontrakt i PersonProjects), skrzynka kontraktu = osoby kontraktu.
 */
export function mailboxAssigneeRows(mailboxes: MailboxOwnerRow[], edges: MembershipEdge[]): MailboxAssigneeRow[] {
    return mailboxes.flatMap<MailboxAssigneeRow>(({ code, address, projectOurId, contractId, allEmployees, passwordVersion }) => {
        const ids = !projectOurId ? []
            : contractId ? contractMemberIds(edges, contractId, projectOurId)
            : projectMemberIds(edges, projectOurId);
        const kind = { owned: !!projectOurId || !!contractId, allEmployees: !!allEmployees, passwordVersion: passwordVersion ?? null };
        return ids.length ? ids.map((personId) => ({ code, address, personId, ...kind })) : [{ code, address, personId: null, ...kind }];
    });
}

/** `role` = tylko z roli (K1); przypisanie ma pierwszeństwo, żeby `assignment`/`both` znaczyły to co przed SKO. */
export type MailboxAccessSource = 'assignment' | 'manual' | 'both' | 'role';

export interface PersonMailbox {
    code: string;
    address: string;
    source: MailboxAccessSource;
}

/**
 * JEDYNE miejsce reguły "jakie skrzynki ma osoba" (plan MBX, D2; plan SKO, K1): role ALL_PROJECT_MAIL_ROLES
 * mają każdą skrzynkę projektu i kontraktu z hasłem od PS oraz ogólnofirmowe "wszyscy pracownicy" (skrzynka projektu
 * bez hasła od PS do czasu przejęcia działa jak przed SKO: przypisania i wyjątki ręczne); pozostałe role - skrzynki
 * projektów i kontraktów, do których są przypisane (mailboxAssigneeRows), poza rolami NO_PROJECT_MAIL_ROLES;
 * każdy dodatkowo wyjątki ręczne z SbAccess.Levels.mail. Kody ręczne spoza spisu są pomijane
 * (nie ma dla nich adresu). Limit SB_MAX_MAILBOXES dotyczy tylko wyjątków ręcznych.
 * Czysta funkcja, bez I/O; hasła rozstrzyga osobno `expectedSecretNames`.
 */
export function personMailboxes(
    personId: number,
    rows: MailboxAssigneeRow[],
    manualCodes: string[],
    systemRoleName: string | null | undefined,
): PersonMailbox[] {
    const allStaff = ALL_PROJECT_MAIL_ROLES.includes(systemRoleName as SystemRoleName);
    const byCode = new Map<string, PersonMailbox & { assigned: boolean; byRole: boolean }>();
    for (const row of rows) {
        const entry = byCode.get(row.code) ?? { code: row.code, address: row.address, source: 'manual' as const, assigned: false, byRole: false };
        if (!NO_PROJECT_MAIL_ROLES.includes(systemRoleName as SystemRoleName)
            && row.personId === personId) entry.assigned = true;
        if (allStaff && ((row.owned && row.passwordVersion != null) || row.allEmployees)) entry.byRole = true;
        byCode.set(row.code, entry);
    }
    const manual = new Set(manualCodes);
    return [...byCode.values()]
        .filter((entry) => entry.assigned || entry.byRole || manual.has(entry.code))
        .map(({ code, address, assigned, byRole }) => ({
            code,
            address,
            source: assigned ? (manual.has(code) ? 'both' : 'assignment') : byRole ? 'role' : 'manual',
        }) as PersonMailbox)
        .sort((a, b) => a.code.localeCompare(b.code));
}
