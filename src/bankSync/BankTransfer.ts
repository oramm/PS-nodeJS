export type MatchingStatus = 'UNMATCHED' | 'PROPOSED' | 'CONFIRMED' | 'MANUAL';

export const FEE_TYPES = new Set(['Opłata', 'Opłata za użytkowanie karty']);

export function supportsInvoiceQueue(transfer: Pick<BankTransfer, 'direction' | 'currency' | 'operationType' | 'amount'>): boolean {
    return transfer.direction === 'IN' && transfer.currency === 'PLN' &&
        transfer.amount > 0 && !FEE_TYPES.has(transfer.operationType);
}

export interface MatchingCandidate {
    invoiceId?: number;
    costInvoiceId?: number;
    score: number;
    invoiceNumber?: string;
    grossAmount?: number;
    originalAmount?: number;
    remainingAmount?: number;
    entityName?: string | null;
    paymentDeadline?: string | null;
    contractNumber?: string | null;
    flags?: string[];
}

export function isExactInvoiceCandidate(candidate: MatchingCandidate): boolean {
    return candidate.flags?.includes('INVOICE_NUMBER') === true && candidate.flags.includes('EQUAL_AMOUNT');
}

export default class BankTransfer {
    id?: number;
    bankStatementId: number;
    orderDate?: string | null;
    execDate: string;
    operationType: string;
    direction: 'IN' | 'OUT';
    amount: number;
    currency: string;
    counterpartyAccount?: string | null;
    counterpartyName?: string | null;
    counterpartyNip?: string | null;
    title?: string | null;
    description?: string | null;
    operationHash: string;
    matchingStatus: MatchingStatus;
    matchingScore?: number | null;
    matchingCandidates?: MatchingCandidate[] | null;
    reviewAsPayment?: boolean;
    importNeedsReview?: boolean;

    constructor(data: Partial<BankTransfer> & { bankStatementId: number; execDate: string; operationType: string; direction: 'IN' | 'OUT'; amount: number; currency: string; operationHash: string }) {
        this.id = data.id;
        this.bankStatementId = data.bankStatementId;
        this.orderDate = data.orderDate ?? null;
        this.execDate = data.execDate;
        this.operationType = data.operationType;
        this.direction = data.direction;
        this.amount = data.amount;
        this.currency = data.currency;
        this.counterpartyAccount = data.counterpartyAccount ?? null;
        this.counterpartyName = data.counterpartyName ?? null;
        this.counterpartyNip = data.counterpartyNip ?? null;
        this.title = data.title ?? null;
        this.description = data.description ?? null;
        this.operationHash = data.operationHash;
        this.matchingStatus = data.matchingStatus ?? 'UNMATCHED';
        this.matchingScore = data.matchingScore ?? null;
        this.matchingCandidates = data.matchingCandidates ?? null;
        this.reviewAsPayment = data.reviewAsPayment;
        this.importNeedsReview = data.importNeedsReview;
    }
}
