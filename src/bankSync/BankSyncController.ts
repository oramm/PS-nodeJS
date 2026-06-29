import { createHash } from 'crypto';
import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import { PkoBpXmlParser, PkoBpOperation } from './parsers/PkoBpXmlParser';
import BankStatement from './BankStatement';
import BankTransfer from './BankTransfer';
import PaymentAllocation from './PaymentAllocation';
import BankStatementRepository from './BankStatementRepository';
import BankTransferRepository from './BankTransferRepository';
import PaymentAllocationRepository from './PaymentAllocationRepository';
import { TransferMatcher, MatchProposal } from './matching/TransferMatcher';
import InvoiceRepository from '../invoices/InvoiceRepository';
import CostInvoiceRepository from '../costInvoices/CostInvoiceRepository';
import InvoiceValidator from '../invoices/InvoiceValidator';
import { CostInvoiceValidator } from '../costInvoices/CostInvoiceValidator';
import { BankSyncValidator } from './BankSyncValidator';
import { extractInvoiceNumbers } from './parsers/pkoBpDescriptionHelpers';
import OfferBondRepository from '../offers/OfferBond/OfferBondRepository';
import Setup from '../setup/Setup';

const FEE_TYPES = new Set(['Opłata', 'Opłata za użytkowanie karty']);

export interface UploadPreview {
    statementId: number;
    total: number;
    autoMatched: number;
    proposed: number;
    unmatched: number;
    fees: number;
    foreignCurrency: number;
}

export interface AllocationResult {
    allocationId: number;
    invoiceId?: number;
    costInvoiceId?: number;
    allocatedAmount: number;
    allocatedPercentage: number;
    newPaymentStatus: string;
    newPaidAmount: number;
}

export interface DuplicateGroup {
    type: 'COUNTERPARTY' | 'INVOICE_NUMBER';
    signal: string;
    transfers: BankTransfer[];
}

export interface WadiumMatchResult {
    bond: {
        id: number;
        offerId: number;
        offerAlias: string | null;
        value: number;
        status: string;
        expiryDate: string | null;
    };
    matchingTransfers: BankTransfer[];
    isReturned: boolean;
}

export class BankSyncError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
        super(message);
        this.statusCode = statusCode;
    }
}

export default class BankSyncController {
    private statementRepo = new BankStatementRepository();
    private transferRepo = new BankTransferRepository();
    private allocationRepo = new PaymentAllocationRepository();
    private matcher = new TransferMatcher();
    private invoiceRepo = new InvoiceRepository();
    private costInvoiceRepo = new CostInvoiceRepository();
    private offerBondRepo = new OfferBondRepository();

    // =====================================================
    // UPLOAD (parse → persist transfers → run matcher → return preview)
    // =====================================================

    async upload(
        buffer: Buffer,
        fileName: string,
        userId?: number | null,
    ): Promise<UploadPreview> {
        const rawChecksum = createHash('sha256').update(buffer).digest('hex');

        // Idempotency: reject duplicate files
        const existing = await this.statementRepo.findByChecksum(rawChecksum);
        if (existing) {
            throw new BankSyncError(409, `Plik już został zaimportowany (BankStatement #${existing.id})`);
        }

        const parsed = PkoBpXmlParser.parse(buffer);

        let autoMatched = 0;
        let proposed = 0;
        let unmatched = 0;
        let fees = 0;
        let foreignCurrency = 0;

        // Determine closing balance (last endingBalance in file)
        let closingBalance: number | null = null;
        for (const op of parsed.operations) {
            if (op.endingBalance !== null) closingBalance = op.endingBalance;
        }

        // Collect per-operation proposals before DB transaction
        type OpWithProposal = { op: PkoBpOperation; proposal: MatchProposal | null; isFee: boolean; isForeign: boolean };
        const ops: OpWithProposal[] = [];

        for (const op of parsed.operations) {
            const isFee = FEE_TYPES.has(op.operationType);
            const isForeign = op.currency !== 'PLN';

            if (isFee || isForeign) {
                if (isFee) fees++;
                if (isForeign) foreignCurrency++;
                ops.push({ op, proposal: null, isFee, isForeign });
                continue;
            }

            const proposal = await this.matcher.propose({
                direction: op.direction,
                amount: op.amount,
                currency: op.currency,
                execDate: op.execDate,
                counterpartyAccount: op.counterpartyAccount,
                counterpartyName: op.counterpartyName,
                counterpartyNip: op.counterpartyNip,
                invoiceNumbers: op.invoiceNumbers,
            });

            ops.push({ op, proposal, isFee, isForeign });

            if (proposal.status === 'CONFIRMED') autoMatched++;
            else if (proposal.status === 'PROPOSED') proposed++;
            else unmatched++;
        }

        let statementId!: number;

        await ToolsDb.transaction(async (conn) => {
            // Insert BankStatement
            const statement = new BankStatement({
                fileName,
                ourAccountNumber: parsed.ourAccount,
                periodFrom: parsed.periodFrom,
                periodTo: parsed.periodTo,
                closingBalance,
                importedBy: userId ?? null,
                rawChecksum,
            });
            statementId = await this.statementRepo.insert(statement, conn);

            for (const { op, proposal, isFee, isForeign } of ops) {
                let matchingStatus: BankTransfer['matchingStatus'] = 'UNMATCHED';
                let matchingScore: number | null = null;
                let matchingCandidates = null;

                if (isFee) {
                    matchingStatus = 'MANUAL';
                } else if (isForeign) {
                    matchingStatus = 'MANUAL';
                } else if (proposal) {
                    matchingStatus = proposal.status;
                    matchingScore = Math.round(proposal.score * 100);
                    matchingCandidates = proposal.candidates;
                }

                const transfer = new BankTransfer({
                    bankStatementId: statementId,
                    orderDate: op.orderDate,
                    execDate: op.execDate,
                    operationType: op.operationType,
                    direction: op.direction,
                    amount: op.amount,
                    currency: op.currency,
                    counterpartyAccount: op.counterpartyAccount,
                    counterpartyName: op.counterpartyName,
                    counterpartyNip: op.counterpartyNip,
                    title: op.title,
                    description: op.description,
                    operationHash: op.operationHash,
                    matchingStatus,
                    matchingScore,
                    matchingCandidates,
                });

                // INSERT IGNORE — duplicate hash is silently skipped
                const transferId = await this.transferRepo.insert(transfer, conn);
                if (!transferId) continue; // already existed (duplicate across overlapping exports)

                transfer.id = transferId;

                // Persist AUTO allocations within the same transaction
                if (proposal?.status === 'CONFIRMED' && transferId) {
                    await this.persistAutoAllocation(transfer, proposal, conn);
                }
            }
        });

        return {
            statementId,
            total: parsed.operations.length,
            autoMatched,
            proposed,
            unmatched,
            fees,
            foreignCurrency,
        };
    }

    /** Commits PROPOSED transfers to CONFIRMED (manual review step). */
    async commit(statementId: number, userId?: number | null): Promise<{ committed: number }> {
        const statement = await this.statementRepo.findById(statementId);
        if (!statement) throw new BankSyncError(404, `BankStatement #${statementId} nie istnieje`);

        const proposed = await this.transferRepo.findByStatementIdAndStatus(statementId, 'PROPOSED');

        let committed = 0;
        for (const transfer of proposed) {
            if (!transfer.matchingCandidates?.length) continue;

            const best = transfer.matchingCandidates[0];

            await ToolsDb.transaction(async (conn) => {
                const alloc = new PaymentAllocation({
                    bankTransferId: transfer.id!,
                    invoiceId: best.invoiceId ?? null,
                    costInvoiceId: best.costInvoiceId ?? null,
                    allocatedAmount: best.remainingAmount ?? transfer.amount,
                    allocatedPercentage: 100,
                    source: 'MANUAL',
                    confidence: best.score ? Math.round(best.score * 100) : null,
                    createdBy: userId ?? null,
                });
                await this.allocationRepo.insert(alloc, conn);
                await this.transferRepo.updateMatchingStatus(transfer.id!, 'CONFIRMED', transfer.matchingScore, null, conn);
                if (best.invoiceId) await this.updateInvoicePaymentStatus(best.invoiceId, conn);
                if (best.costInvoiceId) await this.updateCostInvoicePaymentStatus(best.costInvoiceId, conn);
            });
            committed++;
        }

        return { committed };
    }

    // =====================================================
    // DUPLICATE DETECTION
    // =====================================================

    async getDuplicates(): Promise<DuplicateGroup[]> {
        const transfers = await this.transferRepo.findForDuplicateCheck();

        const buckets = new Map<string, BankTransfer[]>();

        for (const t of transfers) {
            // Group by counterparty account + amount (primary signal)
            if (t.counterpartyAccount) {
                const key = `ACCT|${t.direction}|${t.currency}|${t.amount}|${t.counterpartyAccount}`;
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key)!.push(t);
            }

            // For OUT transfers: additionally group by invoice numbers found in description
            if (t.direction === 'OUT' && t.description) {
                for (const inv of extractInvoiceNumbers(t.description)) {
                    const key = `INV|${inv}`;
                    if (!buckets.has(key)) buckets.set(key, []);
                    buckets.get(key)!.push(t);
                }
            }
        }

        const result: DuplicateGroup[] = [];
        for (const [key, group] of buckets) {
            if (group.length < 2) continue;
            const type: DuplicateGroup['type'] = key.startsWith('INV|') ? 'INVOICE_NUMBER' : 'COUNTERPARTY';
            const signal = key.split('|').slice(1).join('|');
            result.push({ type, signal, transfers: group });
        }

        return result;
    }

    // =====================================================
    // WADIUM VERIFICATION
    // =====================================================

    async getWadiumMatches(): Promise<WadiumMatchResult[]> {
        const [wadiumTransfers, allCashBonds] = await Promise.all([
            this.transferRepo.findWadiumTransfers(),
            this.offerBondRepo.find([
                { status: Setup.OfferBondStatus.PAID },
                { status: Setup.OfferBondStatus.TO_BE_RETURNED },
                { status: Setup.OfferBondStatus.DONE },
                { status: Setup.OfferBondStatus.RETURNED },
            ]),
        ]);

        const cashBonds = allCashBonds.filter((b) => b.form === Setup.OfferBondForm.CASH);

        return cashBonds.map((bond) => {
            const bondValue = Number(bond.value);
            // tolerance: 5% or 200 PLN — returned bonds may include accrued interest
            const tolerance = Math.max(bondValue * 0.05, 200);
            const matching = wadiumTransfers.filter(
                (t) => Math.abs(t.amount - bondValue) <= tolerance,
            );
            return {
                bond: {
                    id: bond.id!,
                    offerId: bond.offerId,
                    offerAlias: bond.offerAlias ?? null,
                    value: bondValue,
                    status: bond.status,
                    expiryDate: bond.expiryDate ?? null,
                },
                matchingTransfers: matching,
                isReturned: bond.status === Setup.OfferBondStatus.RETURNED,
            };
        });
    }

    // =====================================================
    // MANUAL QUEUE
    // =====================================================

    async getPendingTransfers() {
        return this.transferRepo.findPending();
    }

    async createAllocation(
        transferId: number,
        body: Record<string, unknown>,
        userId?: number | null,
    ): Promise<AllocationResult> {
        const validationError = BankSyncValidator.validateAllocationRequest(body);
        if (validationError) throw new BankSyncError(400, validationError);

        const transfer = await this.transferRepo.findById(transferId);
        if (!transfer) throw new BankSyncError(404, `BankTransfer #${transferId} nie istnieje`);

        const invoiceId = body.invoiceId ? Number(body.invoiceId) : null;
        const costInvoiceId = body.costInvoiceId ? Number(body.costInvoiceId) : null;
        const amount = Number(body.amount);

        let grossAmount = 0;
        let alreadyPaid = 0;

        if (invoiceId) {
            const inv = await this.invoiceRepo.findById(invoiceId);
            if (!inv) throw new BankSyncError(404, `Faktura #${invoiceId} nie istnieje`);
            grossAmount = inv._totalGrossValue ?? inv._totalNetValue ?? 0;
            alreadyPaid = inv.paidAmount ?? 0;
        } else if (costInvoiceId) {
            const ci = await this.costInvoiceRepo.findById(costInvoiceId);
            if (!ci) throw new BankSyncError(404, `Faktura kosztowa #${costInvoiceId} nie istnieje`);
            grossAmount = ci.grossAmount;
            alreadyPaid = ci.paidAmount;
        }

        const remaining = Math.max(0, grossAmount - alreadyPaid);
        if (amount > remaining + 0.01) {
            throw new BankSyncError(400, `Kwota alokacji (${amount}) przekracza pozostałą kwotę faktury (${remaining})`);
        }

        const percentage = grossAmount > 0 ? Math.round((amount / grossAmount) * 10000) / 100 : 100;

        let allocId!: number;
        let newPaidAmount = 0;
        let newStatus = 'UNPAID';

        await ToolsDb.transaction(async (conn) => {
            const alloc = new PaymentAllocation({
                bankTransferId: transferId,
                invoiceId,
                costInvoiceId,
                allocatedAmount: amount,
                allocatedPercentage: percentage,
                source: 'MANUAL',
                createdBy: userId ?? null,
            });
            allocId = await this.allocationRepo.insert(alloc, conn);
            await this.transferRepo.updateMatchingStatus(transferId, 'CONFIRMED', null, null, conn);

            if (invoiceId) {
                const result = await this.updateInvoicePaymentStatus(invoiceId, conn);
                newPaidAmount = result.paidAmount;
                newStatus = result.paymentStatus;
            } else if (costInvoiceId) {
                const result = await this.updateCostInvoicePaymentStatus(costInvoiceId, conn);
                newPaidAmount = result.paidAmount;
                newStatus = result.paymentStatus;
            }
        });

        return {
            allocationId: allocId,
            invoiceId: invoiceId ?? undefined,
            costInvoiceId: costInvoiceId ?? undefined,
            allocatedAmount: amount,
            allocatedPercentage: percentage,
            newPaymentStatus: newStatus,
            newPaidAmount,
        };
    }

    async deleteAllocation(allocId: number): Promise<{ invoiceId?: number; costInvoiceId?: number }> {
        const alloc = await this.allocationRepo.findById(allocId);
        if (!alloc) throw new BankSyncError(404, `PaymentAllocation #${allocId} nie istnieje`);

        const { invoiceId, costInvoiceId, bankTransferId } = alloc;

        await ToolsDb.transaction(async (conn) => {
            await this.allocationRepo.delete(allocId, conn);

            // Recalculate payment status
            if (invoiceId) await this.updateInvoicePaymentStatus(invoiceId, conn);
            if (costInvoiceId) await this.updateCostInvoicePaymentStatus(costInvoiceId, conn);

            // If no more allocations, reset transfer to UNMATCHED
            const remaining = await this.allocationRepo.findByTransferId(bankTransferId, conn);
            if (remaining.length === 0) {
                await this.transferRepo.updateMatchingStatus(bankTransferId, 'UNMATCHED', null, null, conn);
            }
        });

        return {
            invoiceId: invoiceId ?? undefined,
            costInvoiceId: costInvoiceId ?? undefined,
        };
    }

    // =====================================================
    // PRIVATE HELPERS
    // =====================================================

    private async persistAutoAllocation(
        transfer: BankTransfer,
        proposal: MatchProposal,
        conn: mysql.PoolConnection,
    ): Promise<void> {
        if (!proposal.allocatedAmount) return;

        const invoiceId = proposal.invoiceId ?? null;
        const costInvoiceId = proposal.costInvoiceId ?? null;

        const alloc = new PaymentAllocation({
            bankTransferId: transfer.id!,
            invoiceId,
            costInvoiceId,
            allocatedAmount: proposal.allocatedAmount,
            allocatedPercentage: 100,
            source: 'AUTO',
            confidence: Math.round(proposal.score * 100),
        });
        await this.allocationRepo.insert(alloc, conn);

        if (invoiceId) await this.updateInvoicePaymentStatus(invoiceId, conn);
        if (costInvoiceId) await this.updateCostInvoicePaymentStatus(costInvoiceId, conn);
    }

    /** Recalculate Invoice payment status from allocations and update DB. */
    private async updateInvoicePaymentStatus(
        invoiceId: number,
        conn: mysql.PoolConnection,
    ): Promise<{ paymentStatus: string; paidAmount: number }> {
        const inv = await this.invoiceRepo.findById(invoiceId);
        if (!inv) throw new Error(`Invoice #${invoiceId} not found`);

        const grossAmount = inv._totalGrossValue ?? inv._totalNetValue ?? 0;
        const paidAmount = await this.allocationRepo.sumAllocatedForInvoice(invoiceId, conn);

        let paymentStatus: string;
        if (paidAmount <= 0) paymentStatus = 'UNPAID';
        else if (Math.abs(paidAmount - grossAmount) <= 0.01) paymentStatus = 'PAID';
        else paymentStatus = 'PARTIALLY_PAID';

        await this.invoiceRepo.updatePayment(invoiceId, { paymentStatus, paidAmount }, conn);
        return { paymentStatus, paidAmount };
    }

    /** Recalculate CostInvoice payment status from allocations and update DB. */
    private async updateCostInvoicePaymentStatus(
        costInvoiceId: number,
        conn: mysql.PoolConnection,
    ): Promise<{ paymentStatus: string; paidAmount: number }> {
        const ci = await this.costInvoiceRepo.findById(costInvoiceId);
        if (!ci) throw new Error(`CostInvoice #${costInvoiceId} not found`);

        const grossAmount = ci.grossAmount;
        const paidAmount = await this.allocationRepo.sumAllocatedForCostInvoice(costInvoiceId, conn);

        let paymentStatus: string;
        if (paidAmount <= 0) paymentStatus = 'UNPAID';
        else if (Math.abs(paidAmount - grossAmount) <= 0.01) paymentStatus = 'PAID';
        else paymentStatus = 'PARTIALLY_PAID';

        await this.costInvoiceRepo.updatePayment(costInvoiceId, { paymentStatus, paidAmount }, conn);
        return { paymentStatus, paidAmount };
    }
}
