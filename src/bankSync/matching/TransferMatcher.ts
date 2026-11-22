import ToolsDb from '../../tools/ToolsDb';
import type { PoolConnection } from 'mysql2/promise';
import Setup from '../../setup/Setup';
import { MatchingCandidate } from '../BankTransfer';
import InvoiceRepository, { SalesPaymentCandidate } from '../../invoices/InvoiceRepository';
import {
    invoiceNumberSignal,
    nipSignal,
    accountSignal,
    nameSimilarity,
    amountSignal,
    dateWindowSignal,
    matchesSalesAmount,
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

export interface CandidatePool {
    invoices: SalesPaymentCandidate[];
    costInvoices: any[];
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
    const s_nip = input.direction === 'OUT' ? nipSignal(input.counterpartyNip, inv.entityTaxNumber) : 0;
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
    private invoiceRepo = new InvoiceRepository();

    async loadCandidates(directions: ReadonlySet<MatchInput['direction']>, conn?: PoolConnection): Promise<CandidatePool> {
        const [invoices, costInvoices] = await Promise.all([
            directions.has('IN') ? this.invoiceRepo.findPaymentCandidates(conn) : [],
            directions.has('OUT') ? ToolsDb.getQueryCallbackAsync(`
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
            WHERE ci.PaymentStatus IN (?, ?)
            `, conn, [Setup.InvoicePaymentStatus.UNPAID, Setup.InvoicePaymentStatus.PARTIALLY_PAID]) : [],
        ]);
        return { invoices, costInvoices: costInvoices as any[] };
    }

    propose(input: MatchInput, pool: CandidatePool): MatchProposal {
        if (input.currency !== 'PLN') {
            return { status: 'UNMATCHED', score: 0, candidates: [] };
        }

        const { ownAccounts } = Setup.Bank;
        const account = input.counterpartyAccount?.replace(/\s/g, '');
        if (account && ownAccounts.includes(account)) {
            return { status: 'UNMATCHED', score: 0, candidates: [], flags: ['OWN_TRANSFER'] };
        }
        return input.direction === 'IN'
            ? this.matchIncoming(input, pool.invoices)
            : this.matchOutgoing(input, pool.costInvoices);
    }

    private matchIncoming(input: MatchInput, rows: SalesPaymentCandidate[]): MatchProposal {
        return this.buildProposal(input, rows, WEIGHTS_IN, (row) => ({
            invoiceId: row.Id,
            invoiceNumber: row.InvoiceNumber,
            grossAmount: Number(row.DueAmount),
            alreadyPaid: Number(row.AllocatedAmount),
            entityTaxNumber: row.EntityTaxNumber,
            entityBankAccount: row.EntityBankAccount,
            entityName: row.EntityName,
            issueDate: row.IssueDate,
            paymentDeadline: row.PaymentDeadline,
        }), 'invoice');
    }

    private matchOutgoing(input: MatchInput, rows: any[]): MatchProposal {
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
            if (type === 'invoice' && mapped.grossAmount <= mapped.alreadyPaid) continue;
            const { score, flags } = scoreInvoice(input, mapped, weights);
            scored.push({ mapped, score, flags });
        }

        if (scored.length === 0) {
            return { status: 'UNMATCHED', score: 0, candidates: [] };
        }

        scored.sort((a, b) => b.score - a.score
            || (a.mapped.invoiceId ?? a.mapped.costInvoiceId ?? 0)
                - (b.mapped.invoiceId ?? b.mapped.costInvoiceId ?? 0));
        const best = scored[0];
        // Numery faktur bywają powtórzone, więc automat wymaga jednej zgodnej pary numer–kwota.
        const exactSales = type === 'invoice' ? scored.filter(({ mapped }) =>
            invoiceNumberSignal(input.invoiceNumbers, mapped.invoiceNumber) === 1
            && matchesSalesAmount(input.amount, mapped.grossAmount - mapped.alreadyPaid)
        ) : [];
        let auto = exactSales.length === 1 ? exactSales[0] : undefined;
        if (type === 'costInvoice' && best.score >= cfg.autoThreshold && !best.flags.includes('OVERPAYMENT')) {
            const hasInvoiceNum = invoiceNumberSignal(input.invoiceNumbers, best.mapped.invoiceNumber) === 1;
            const hasNip = nipSignal(input.counterpartyNip, best.mapped.entityTaxNumber) === 1;
            const hasAccount = accountSignal(input.counterpartyAccount, best.mapped.entityBankAccount) === 1;
            if (hasInvoiceNum || (hasNip && hasAccount)) auto = best;
        }

        const ranked = auto ? [auto, ...scored.filter((candidate) => candidate !== auto)] : scored;
        const candidates: MatchingCandidate[] = ranked.slice(0, TOP_N).map(({ mapped, score, flags }) => ({
            invoiceId: mapped.invoiceId,
            costInvoiceId: mapped.costInvoiceId,
            score: Math.round(score * 100) / 100,
            invoiceNumber: mapped.invoiceNumber,
            grossAmount: mapped.grossAmount,
            remainingAmount: Math.max(0, mapped.grossAmount - mapped.alreadyPaid),
            flags,
        }));

        if (auto) {
            const remaining = Math.max(0, auto.mapped.grossAmount - auto.mapped.alreadyPaid);
            const alloc = Math.min(input.amount, type === 'invoice' ? Math.round(remaining * 100) / 100 : remaining);
            return {
                status: 'CONFIRMED',
                score: auto.score,
                candidates,
                invoiceId: auto.mapped.invoiceId,
                costInvoiceId: auto.mapped.costInvoiceId,
                allocatedAmount: alloc,
                flags: auto.flags,
            };
        }

        if (exactSales.length > 1 || best.score >= cfg.proposeThreshold) {
            return { status: 'PROPOSED', score: best.score, candidates, flags: best.flags };
        }

        return { status: 'UNMATCHED', score: best.score, candidates };
    }
}
