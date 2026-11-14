import { contractAssigneeIds } from '../contracts/contractAssignees';

/** Skrzynka i osoby przypisane do jednego z jej kontraktów (brak kontraktu = null). */
export interface MailboxAssigneeRow {
    code: string;
    address: string;
    managerId: number | null;
    adminId: number | null;
    selectedPersonId?: number | null;
}

export type MailboxAccessSource = 'assignment' | 'manual' | 'both';

export interface PersonMailbox {
    code: string;
    address: string;
    source: MailboxAccessSource;
}

/**
 * JEDYNE miejsce reguły "jakie skrzynki ma osoba" (plan MBX, D2): skrzynki projektów i kontraktów,
 * do których jest przypisana (kierownik / administrator / wybrana osoba; skrzynka projektu = każdy kontrakt
 * projektu), plus wyjątki ręczne z SbAccess.Levels.mail. Kody ręczne spoza spisu są pomijane
 * (nie ma dla nich adresu). Limit SB_MAX_MAILBOXES dotyczy tylko wyjątków ręcznych.
 * Czysta funkcja, bez I/O; hasła rozstrzyga osobno `expectedSecretNames`.
 */
export function personMailboxes(
    personId: number,
    rows: MailboxAssigneeRow[],
    manualCodes: string[],
): PersonMailbox[] {
    const byCode = new Map<string, PersonMailbox & { assigned: boolean }>();
    for (const row of rows) {
        const entry = byCode.get(row.code) ?? { code: row.code, address: row.address, source: 'manual' as const, assigned: false };
        if (contractAssigneeIds(row.managerId, row.adminId, row.selectedPersonId).includes(personId)) entry.assigned = true;
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
