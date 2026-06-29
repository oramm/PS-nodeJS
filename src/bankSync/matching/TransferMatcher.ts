import ToolsDb from '../../tools/ToolsDb';
import Setup from '../../setup/Setup';
import { MatchingCandidate } from '../BankTransfer';
import {
    invoiceNumberSignal,
    nipSignal,
    accountSignal,
    nameSimilarity,
    amountSignal,
    dateWindowSignal,
} from './signals';

export interface MatchInput {
    direction: 'IN' | 'OUT';
    amount: number;
    currency: string;
    execDate: string;
    counterpartyAccount: string | null;
    counterpartyName: string | null;
    counterpartyNip: string | null;
    invoiceNumbers: string[];
}

export interface MatchProposal {
    status: 'CONFIRMED' | 'PROPOSED' | 'UNMATCHED';
    score: number;
    candidates: MatchingCandidate[];
    /** Set when status=CONFIRMED and direction=IN */
    invoiceId?: number;
    /** Set when status=CONFIRMED and direction=OUT */
    costInvoiceId?: number;
    allocatedAmount?: number;
    flags?: string[];
}

const TOP_N = 5;

// Weight tables per direction
const WEIGHTS_IN = {
    invoiceNumber: 0.45,
    nip: 0.25,
    account: 0.20,
    name: 0.10,
    amount: 0.20,
    date: 0.05,
};
const WEIGHTS_OUT = {
    invoiceNumber: 0.45,
    nip: 0.30,
    account: 0.30,
    name: 0.10,
    amount: 0.20,
    date: 0.05,
};

type WeightMap = typeof WEIGHTS_IN;

function scoreInvoice(
    input: MatchInput,
    inv: {
        invoiceNumber: string;
        entityTaxNumber: string | null;
        entityBankAccount: string | null;
        entityName: string | null;
        issueDate: string | null;
        paymentDeadline: string | null;
        grossAmount: number;
        alreadyPaid: number;
    },
    weights: WeightMap,
): { score: number; flags: string[] } {
    const remaining = Math.max(0, inv.grossAmount - inv.alreadyPaid);
    const flags: string[] = [];

    const s_invoiceNum = invoiceNumberSignal(input.invoiceNumbers, inv.invoiceNumber);
    const s_nip = nipSignal(input.counterpartyNip, inv.entityTaxNumber);
    const s_account = accountSignal(input.counterpartyAccount, inv.entityBankAccount);
    const s_name = nameSimilarity(input.counterpartyName, inv.entityName);
    const s_amount = amountSignal(input.amount, remaining);
    const s_date = dateWindowSignal(input.execDate, inv.issueDate, inv.paymentDeadline);

    if (input.amount > remaining + 0.01) flags.push('OVERPAYMENT');

    const total =
        s_invoiceNum * weights.invoiceNumber +
        s_nip * weights.nip +
        s_account * weights.account +
        s_name * weights.name +
        s_amount * weights.amount +
        s_date * weights.date;

    // Normalize to [0,1] by sum of all weights
    const weightSum = Object.values(weights).reduce((a, b) => a + b, 0);
    return { score: total / weightSum, flags };
}

export class TransferMatcher {
    /**
     * Returns matching proposal for a single transfer.
     * Does NOT write to DB — caller persists results.
     */
    async propose(input: MatchInput): Promise<MatchProposal> {
        if (input.currency !== 'PLN') {
            return { status: 'UNMATCHED', score: 0, candidates: [] };
        }

        if (input.direction === 'IN') {
            return this.matchIncoming(input);
        } else {
            return this.matchOutgoing(input);
        }
    }

    private async matchIncoming(input: MatchInput): Promise<MatchProposal> {
        const rows = (await ToolsDb.getQueryCallbackAsync(`
            SELECT
                i.Id,
                i.Number AS InvoiceNumber,
                i.IssueDate,
                i.PaymentDeadline,
                i.PaymentStatus,
                COALESCE(SUM(ii.Quantity * ii.UnitPrice), 0) AS GrossAmount,
                COALESCE(i.PaidAmount, 0) AS PaidAmount,
                e.TaxNumber AS EntityTaxNumber,
                e.BankAccountNumber AS EntityBankAccount,
                e.Name AS EntityName
            FROM Invoices i
            JOIN Entities e ON e.Id = i.EntityId
            LEFT JOIN InvoiceItems ii ON ii.ParentId = i.Id
            WHERE i.PaymentStatus IN ('UNPAID','PARTIALLY_PAID')
            GROUP BY i.Id
        `)) as any[];

        return this.buildProposal(input, rows, WEIGHTS_IN, (row) => ({
            invoiceId: row.Id,
            invoiceNumber: row.InvoiceNumber,
            grossAmount: Number(row.GrossAmount),
            alreadyPaid: Number(row.PaidAmount),
            entityTaxNumber: row.EntityTaxNumber,
            entityBankAccount: row.EntityBankAccount,
            entityName: row.EntityName,
            issueDate: row.IssueDate ? String(row.IssueDate).slice(0, 10) : null,
            paymentDeadline: row.PaymentDeadline ? String(row.PaymentDeadline).slice(0, 10) : null,
        }), 'invoice');
    }

    private async matchOutgoing(input: MatchInput): Promise<MatchProposal> {
        const rows = (await ToolsDb.getQueryCallbackAsync(`
            SELECT
                ci.Id,
                ci.InvoiceNumber,
                ci.IssueDate,
                ci.DueDate AS PaymentDeadline,
                ci.PaymentStatus,
                ci.GrossAmount,
                COALESCE(ci.PaidAmount, 0) AS PaidAmount,
                ci.SupplierNip AS EntityTaxNumber,
                ci.SupplierBankAccount AS EntityBankAccount,
                ci.SupplierName AS EntityName
            FROM CostInvoices ci
            WHERE ci.PaymentStatus IN ('UNPAID','PARTIALLY_PAID')
        `)) as any[];

        return this.buildProposal(input, rows, WEIGHTS_OUT, (row) => ({
            costInvoiceId: row.Id,
            invoiceNumber: row.InvoiceNumber,
            grossAmount: Number(row.GrossAmount),
            alreadyPaid: Number(row.PaidAmount),
            entityTaxNumber: row.EntityTaxNumber,
            entityBankAccount: row.EntityBankAccount,
            entityName: row.EntityName,
            issueDate: row.IssueDate ? String(row.IssueDate).slice(0, 10) : null,
            paymentDeadline: row.PaymentDeadline ? String(row.PaymentDeadline).slice(0, 10) : null,
        }), 'costInvoice');
    }

    private buildProposal(
        input: MatchInput,
        rows: any[],
        weights: WeightMap,
        mapRow: (row: any) => {
            invoiceId?: number;
            costInvoiceId?: number;
            invoiceNumber: string;
            grossAmount: number;
            alreadyPaid: number;
            entityTaxNumber: string | null;
            entityBankAccount: string | null;
            entityName: string | null;
            issueDate: string | null;
            paymentDeadline: string | null;
        },
        type: 'invoice' | 'costInvoice',
    ): MatchProposal {
        const cfg = Setup.Bank.matching;
        const scored: Array<{ mapped: ReturnType<typeof mapRow>; score: number; flags: string[] }> = [];

        for (const row of rows) {
            const mapped = mapRow(row);
            const { score, flags } = scoreInvoice(
                input,
                {
                    invoiceNumber: mapped.invoiceNumber,
                    entityTaxNumber: mapped.entityTaxNumber,
                    entityBankAccount: mapped.entityBankAccount,
                    entityName: mapped.entityName,
                    issueDate: mapped.issueDate,
                    paymentDeadline: mapped.paymentDeadline,
                    grossAmount: mapped.grossAmount,
                    alreadyPaid: mapped.alreadyPaid,
                },
                weights,
            );
            scored.push({ mapped, score, flags });
        }

        scored.sort((a, b) => b.score - a.score);
        const top = scored.slice(0, TOP_N);

        const candidates: MatchingCandidate[] = top.map(({ mapped, score, flags }) => ({
            invoiceId: mapped.invoiceId,
            costInvoiceId: mapped.costInvoiceId,
            score: Math.round(score * 100) / 100,
            invoiceNumber: mapped.invoiceNumber,
            grossAmount: mapped.grossAmount,
            remainingAmount: Math.max(0, mapped.grossAmount - mapped.alreadyPaid),
            flags,
        }));

        if (top.length === 0) {
            return { status: 'UNMATCHED', score: 0, candidates: [] };
        }

        const best = top[0];
        const scoreInt = Math.round(best.score * 100);

        // Hard condition for AUTO: must have invoice number OR (NIP + account)
        const hasInvoiceNum = invoiceNumberSignal(input.invoiceNumbers, best.mapped.invoiceNumber) === 1;
        const hasNip = nipSignal(input.counterpartyNip, best.mapped.entityTaxNumber) === 1;
        const hasAccount = accountSignal(input.counterpartyAccount, best.mapped.entityBankAccount) === 1;
        const hardSignal = hasInvoiceNum || (hasNip && hasAccount);

        const isOverpayment = best.flags.includes('OVERPAYMENT');

        if (best.score >= cfg.autoThreshold && hardSignal && !isOverpayment) {
            const id = type === 'invoice' ? best.mapped.invoiceId : best.mapped.costInvoiceId;
            const remaining = Math.max(0, best.mapped.grossAmount - best.mapped.alreadyPaid);
            const alloc = Math.min(input.amount, remaining);
            return {
                status: 'CONFIRMED',
                score: best.score,
                candidates,
                invoiceId: type === 'invoice' ? id : undefined,
                costInvoiceId: type === 'costInvoice' ? id : undefined,
                allocatedAmount: alloc,
                flags: best.flags,
            };
        }

        if (best.score >= cfg.proposeThreshold) {
            return { status: 'PROPOSED', score: best.score, candidates, flags: best.flags };
        }

        return { status: 'UNMATCHED', score: best.score, candidates };
    }
}
