/**
 * WS10 / N5 — Pure classification core for the AQM backfill.
 * No DB, no env, no I/O — so the qualify/skip decision is unit-testable.
 *
 * Skip rules (frozen, O2 + L10):
 *  - NO_EMPLOYER        : 0 EMPLOYER (the ~58 legacy contracts) — not pushable.
 *  - MULTIPLE_EMPLOYERS : >1 EMPLOYER — AQM org identity is 1:1.
 *  - BAD_NIP            : the single EMPLOYER's NIP fails the O2 checksum.
 */

export type SkipReason = 'NO_EMPLOYER' | 'MULTIPLE_EMPLOYERS' | 'BAD_NIP';

/** Minimal shape the core needs from a contract. */
export type EmployerLike = {
    id?: number;
    name?: string;
    taxNumber?: unknown;
    address?: string;
};

export type AnyContractLike = {
    id?: number;
    typeId?: number;
    _employers?: EmployerLike[];
    [key: string]: any;
};

export type BackfillCandidate = {
    contractId: number | undefined;
    legacyEntityId: number | undefined;
    taxNr: string | undefined;
    /** null = qualifies; otherwise the reason it is skipped. */
    skipReason: SkipReason | null;
};

export type BackfillCoreDeps = {
    isValidNip: (nip: unknown) => boolean;
    normalizeNip: (nip: unknown) => string;
};

/**
 * Classify one contract for backfill. Pure function — returns the candidate
 * descriptor with a skipReason (or null when it qualifies). Writes nothing.
 */
export function buildBackfillCandidate(
    contract: AnyContractLike,
    deps: BackfillCoreDeps
): BackfillCandidate {
    const employers = contract._employers ?? [];

    if (employers.length === 0) {
        return {
            contractId: contract.id,
            legacyEntityId: undefined,
            taxNr: undefined,
            skipReason: 'NO_EMPLOYER',
        };
    }

    if (employers.length > 1) {
        return {
            contractId: contract.id,
            legacyEntityId: undefined,
            taxNr: undefined,
            skipReason: 'MULTIPLE_EMPLOYERS',
        };
    }

    const employer = employers[0];
    const taxNr = deps.normalizeNip(employer?.taxNumber);

    if (!deps.isValidNip(employer?.taxNumber)) {
        return {
            contractId: contract.id,
            legacyEntityId: employer?.id,
            taxNr,
            skipReason: 'BAD_NIP',
        };
    }

    return {
        contractId: contract.id,
        legacyEntityId: employer?.id,
        taxNr,
        skipReason: null,
    };
}
