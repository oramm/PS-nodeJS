import type BankTransfer from './BankTransfer';

export const EXECUTION_DATE_WINDOW_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CARD_PAYMENT = 'Płatność kartą';

type Operation = Pick<BankTransfer, 'amount' | 'currency' | 'direction' | 'operationType' |
    'counterpartyAccount' | 'description' | 'orderDate' | 'execDate' | 'operationHash'>;
export type StatementPeriod = { periodFrom: string; periodTo: string };
export type StoredOperation = Operation & StatementPeriod & { id: number; confirmedThrough: string };

function operationKey(operation: Operation): string {
    return JSON.stringify([
        operation.amount, operation.currency, operation.direction, operation.operationType,
        operation.counterpartyAccount || null,
    ]);
}

function cardLocation(description?: string | null): string | null {
    const location = description?.replace(/\s+/g, ' ').match(
        /Lokalizacja\s*:\s*(.*?)\s*Adres\s*:\s*(.+?)\s*Miasto\s*:\s*(.+?)\s*Kraj\s*:\s*(\S+)/iu,
    );
    if (!location) return null;
    return location.slice(1).map(field =>
        field.toUpperCase().normalize('NFD').replace(/Ł/g, 'L')
            .replace(/\p{Pd}/gu, '-')
            .replace(/[^\p{L}\p{N}/\s-]/gu, '')
            .replace(/\s+/g, ' ')
            .replace(/(?<!\d) | (?!\d)/g, ''),
    ).join('|');
}

function cardNumber(description?: string | null): string | undefined {
    return description?.match(/Numer karty\s*:\s*(\S+)/iu)?.[1];
}

function mayBeSameOperation(incoming: Operation, stored: Operation): boolean {
    if (!ISO_DATE.test(incoming.execDate)) return false;
    const executionShift = Math.abs(Date.parse(incoming.execDate) - Date.parse(stored.execDate));
    if (!(executionShift > 0 && executionShift <= EXECUTION_DATE_WINDOW_DAYS * DAY_MS)) return false;

    if (incoming.operationType === CARD_PAYMENT) {
        if (!incoming.orderDate || incoming.orderDate !== stored.orderDate) return false;
        if (incoming.description && incoming.description === stored.description) return true;
        const incomingCard = cardNumber(incoming.description);
        const storedCard = cardNumber(stored.description);
        if (incomingCard && storedCard && incomingCard !== storedCard) return false;
        const location = cardLocation(incoming.description);
        return location !== null && location === cardLocation(stored.description);
    }

    if (incoming.orderDate && stored.orderDate) {
        const orderShift = Math.abs(Date.parse(incoming.orderDate) - Date.parse(stored.orderDate));
        if (!(orderShift <= EXECUTION_DATE_WINDOW_DAYS * DAY_MS)) return false;
    } else if (incoming.orderDate || stored.orderDate) {
        return false;
    }

    return Boolean(incoming.description && incoming.description === stored.description);
}

type ImportMatch = { kind: 'known' | 'shifted'; existing: StoredOperation } | { kind: 'ambiguous' };

/** Stored rows and XML operations are already scoped to the account being imported. */
export function reconcileOperations(
    incoming: readonly Operation[],
    stored: readonly StoredOperation[],
    { periodFrom, periodTo }: StatementPeriod,
): Map<string, ImportMatch> {
    const fileHashes = new Set(incoming.map(operation => operation.operationHash));
    const matches = new Map<string, ImportMatch>();
    const availableByKey = new Map<string, StoredOperation[]>();

    // Reserve all exact matches before looking for date shifts, regardless of file order.
    for (const operation of stored) {
        if (fileHashes.has(operation.operationHash)) {
            matches.set(operation.operationHash, { kind: 'known', existing: operation });
            continue;
        }
        const key = operationKey(operation);
        const available = availableByKey.get(key) ?? [];
        if (available.length === 0) availableByKey.set(key, available);
        available.push(operation);
    }

    const candidatesByHash = new Map<string, StoredOperation[]>();
    const claimCounts = new Map<number, number>();
    for (const operation of incoming) {
        if (matches.has(operation.operationHash)) continue;
        const candidates = availableByKey.get(operationKey(operation))?.filter(
            candidate => mayBeSameOperation(operation, candidate),
        );
        if (!candidates?.length) continue;
        candidatesByHash.set(operation.operationHash, candidates);
        for (const candidate of candidates) {
            claimCounts.set(candidate.id, (claimCounts.get(candidate.id) ?? 0) + 1);
        }
    }

    for (const operation of incoming) {
        const candidates = candidatesByHash.get(operation.operationHash);
        if (!candidates) continue;
        const [candidate] = candidates;
        const covered = (candidate.execDate >= periodFrom && candidate.execDate <= periodTo) ||
            (operation.execDate >= candidate.periodFrom && operation.execDate <= candidate.periodTo);
        matches.set(operation.operationHash, candidates.length === 1 && claimCounts.get(candidate.id) === 1 && covered
            ? { kind: 'shifted', existing: candidate }
            : { kind: 'ambiguous' });
    }

    return matches;
}
