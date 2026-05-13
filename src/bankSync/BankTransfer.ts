export type MatchingStatus = 'UNMATCHED' | 'PROPOSED' | 'CONFIRMED' | 'MANUAL';

export interface MatchingCandidate {
    invoiceId?: number;
    costInvoiceId?: number;
    score: number;
    invoiceNumber?: string;
    grossAmount?: number;
    remainingAmount?: number;
    flags?: string[];
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
    }
}
