/**
 * Individual matching signals, each returning a score in [0, 1].
 */

import Setup from '../../setup/Setup';

/** Normalizes a string for fuzzy comparison: lowercase, collapse whitespace. */
function normalize(s: string): string {
    return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Levenshtein distance between two strings (simple DP). */
function levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

/** 0..1 similarity based on Levenshtein. */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
    if (!a || !b) return 0;
    const na = normalize(a);
    const nb = normalize(b);
    if (!na || !nb) return 0;
    const maxLen = Math.max(na.length, nb.length);
    if (maxLen === 0) return 1;
    return Math.max(0, 1 - levenshtein(na, nb) / maxLen);
}

/** Invoice number match: 1 if any extracted number matches invoice number, else 0. */
export function invoiceNumberSignal(
    extractedNumbers: string[],
    invoiceNumber: string | null | undefined,
): number {
    if (!invoiceNumber || extractedNumbers.length === 0) return 0;
    const norm = normalize(invoiceNumber);
    for (const n of extractedNumbers) {
        if (normalize(n) === norm) return 1;
    }
    return 0;
}

/** NIP match: 1 if NIPs match (non-null), else 0. */
export function nipSignal(
    transferNip: string | null | undefined,
    invoiceNip: string | null | undefined,
): number {
    if (!transferNip || !invoiceNip) return 0;
    return transferNip.replace(/\D/g, '') === invoiceNip.replace(/\D/g, '') ? 1 : 0;
}

/** Bank account match: 1 if accounts match (non-null), else 0. */
export function accountSignal(
    transferAccount: string | null | undefined,
    invoiceAccount: string | null | undefined,
): number {
    if (!transferAccount || !invoiceAccount) return 0;
    const a = transferAccount.replace(/\s/g, '');
    const b = invoiceAccount.replace(/\s/g, '');
    return a === b ? 1 : 0;
}

/**
 * Amount signal: 1 if transfer amount covers the remaining amount within tolerance,
 * partial score for fractional payment.
 */
export function amountSignal(
    transferAmount: number,
    remainingAmount: number,
): number {
    if (remainingAmount <= 0) return 0;
    const tolerancePLN = Setup.Bank.matching.amountToleranceGrosze / 100;
    const diff = Math.abs(transferAmount - remainingAmount);
    if (diff <= tolerancePLN) return 1;
    if (transferAmount < remainingAmount) {
        // Partial payment — score proportional to coverage
        return Math.min(1, transferAmount / remainingAmount);
    }
    // Overpayment — lower score
    return Math.max(0, 1 - (transferAmount - remainingAmount) / remainingAmount);
}

/**
 * Date window signal: 1 if execDate is after issueDate and within dateWindowDays of dueDate.
 * 0.5 if after issueDate but outside window. 0 if before issueDate.
 */
export function dateWindowSignal(
    execDate: string,
    issueDate: string | null | undefined,
    dueDate: string | null | undefined,
): number {
    if (!issueDate) return 0;
    const exec = new Date(execDate).getTime();
    const issue = new Date(issueDate).getTime();
    if (exec < issue) return 0;
    if (!dueDate) return 0.5;
    const due = new Date(dueDate).getTime();
    const windowMs = Setup.Bank.dateWindowDays * 24 * 60 * 60 * 1000;
    return exec <= due + windowMs ? 1 : 0.5;
}
