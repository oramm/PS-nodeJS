import { contractMemberIds, MembershipEdge, projectMemberIds } from '../persons/projectAssignments/projectMembership';
import { SystemRoleName } from '../types/sessionTypes';

/**
 * Role, które nie dostają poczty projektu z przypisania (MBX: pracownik wykonawcy i klient)
 * i których edycja kontraktu nie przyjmuje jako osoby dodatkowej (ContractSelectedPersonsRepository.validate).
 * Celowo węższe niż PROJECT_SCOPED_ROLES ("kto jest ograniczony do przypisań"):
 * współpracownik jest ograniczony, ale pocztę przypisanych projektów ma (plan DOSTEP, D7).
 */
export const NO_PROJECT_MAIL_ROLES: SystemRoleName[] = [SystemRoleName.CONTRACT_WORKER, SystemRoleName.CLIENT];

/** Właściciel skrzynki: projekt (contractId null) albo kontrakt; ogólnofirmowa = oba null. */
export interface MailboxOwnerRow {
    code: string;
    address: string;
    projectOurId: string | null;
    contractId: number | null;
}

/** Skrzynka i jedna osoba do niej przypisana (brak przypisanych = jeden wiersz z null). */
export interface MailboxAssigneeRow {
    code: string;
    address: string;
    personId: number | null;
}

/**
 * Kto jest przypisany do skrzynki - wprost z reguły projectMembership: skrzynka projektu = osoby
 * projektu (każdy kontrakt i PersonProjects), skrzynka kontraktu = osoby kontraktu.
 */
export function mailboxAssigneeRows(mailboxes: MailboxOwnerRow[], edges: MembershipEdge[]): MailboxAssigneeRow[] {
    return mailboxes.flatMap<MailboxAssigneeRow>(({ code, address, projectOurId, contractId }) => {
        const ids = !projectOurId ? []
            : contractId ? contractMemberIds(edges, contractId, projectOurId)
            : projectMemberIds(edges, projectOurId);
        return ids.length ? ids.map((personId) => ({ code, address, personId })) : [{ code, address, personId: null }];
    });
}

export type MailboxAccessSource = 'assignment' | 'manual' | 'both';

export interface PersonMailbox {
    code: string;
    address: string;
    source: MailboxAccessSource;
}

/**
 * JEDYNE miejsce reguły "jakie skrzynki ma osoba" (plan MBX, D2): skrzynki projektów i kontraktów,
 * do których jest przypisana (mailboxAssigneeRows), poza rolami NO_PROJECT_MAIL_ROLES,
 * plus wyjątki ręczne z SbAccess.Levels.mail. Kody ręczne spoza spisu są pomijane
 * (nie ma dla nich adresu). Limit SB_MAX_MAILBOXES dotyczy tylko wyjątków ręcznych.
 * Czysta funkcja, bez I/O; hasła rozstrzyga osobno `expectedSecretNames`.
 */
export function personMailboxes(
    personId: number,
    rows: MailboxAssigneeRow[],
    manualCodes: string[],
    systemRoleName: string | null | undefined,
): PersonMailbox[] {
    const byCode = new Map<string, PersonMailbox & { assigned: boolean }>();
    for (const row of rows) {
        const entry = byCode.get(row.code) ?? { code: row.code, address: row.address, source: 'manual' as const, assigned: false };
        if (!NO_PROJECT_MAIL_ROLES.includes(systemRoleName as SystemRoleName)
            && row.personId === personId) entry.assigned = true;
        byCode.set(row.code, entry);
    }
    const manual = new Set(manualCodes);
    return [...byCode.values()]
        .filter((entry) => entry.assigned || manual.has(entry.code))
        .map(({ code, address, assigned }) => ({
            code,
            address,
            source: assigned ? (manual.has(code) ? 'both' : 'assignment') : 'manual',
        }) as PersonMailbox)
        .sort((a, b) => a.code.localeCompare(b.code));
}
