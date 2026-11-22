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
import { matchesSalesAmount } from './matching/signals';
import InvoiceRepository from '../invoices/InvoiceRepository';
import InvoicesController from '../invoices/InvoicesController';
import CostInvoiceRepository from '../costInvoices/CostInvoiceRepository';
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
        type OpWithProposal = { op: PkoBpOperation; proposal: MatchProposal | null; isManual: boolean };
        const ops: OpWithProposal[] = [];

        const operations = [...parsed.operations].sort((a, b) =>
            a.execDate.localeCompare(b.execDate) || a.operationHash.localeCompare(b.operationHash),
        );
        const directions = new Set(operations
            .filter((op) => op.currency === 'PLN' && !FEE_TYPES.has(op.operationType))
            .map((op) => op.direction));
        const pool = await this.matcher.loadCandidates(directions);

        for (const op of operations) {
            const isFee = FEE_TYPES.has(op.operationType);
            const isForeign = op.currency !== 'PLN';

            if (isFee || isForeign) {
                if (isFee) fees++;
                if (isForeign) foreignCurrency++;
                ops.push({ op, proposal: null, isManual: true });
                continue;
            }

            const proposal = this.matcher.propose(
                {
                    direction: op.direction,
                    amount: op.amount,
                    currency: op.currency,
                    execDate: op.execDate,
                    counterpartyAccount: op.counterpartyAccount,
                    counterpartyName: op.counterpartyName,
                    counterpartyNip: op.counterpartyNip,
                    invoiceNumbers: op.direction === 'IN'
                        ? extractInvoiceNumbers(op.description, false)
                        : op.invoiceNumbers,
                },
                pool,
            );

            const isManual = proposal.flags?.includes('OWN_TRANSFER') ?? false;
            ops.push({ op, proposal, isManual });

            if (isManual) continue;
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

            for (const { op, proposal, isManual } of ops) {
                let matchingStatus: BankTransfer['matchingStatus'] = 'UNMATCHED';
                let matchingScore: number | null = null;
                let matchingCandidates = null;

                if (isManual) {
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

                if (proposal?.status === 'CONFIRMED') {
                    const allocated = await this.persistAutoAllocation(transfer, proposal, conn);
                    if (!allocated) {
                        await this.transferRepo.updateMatchingStatus(
                            transferId, 'PROPOSED', matchingScore, proposal.candidates, conn,
                        );
                        autoMatched--;
                        proposed++;
                    }
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
        for (const proposal of proposed) {
            const didCommit = await ToolsDb.transaction<boolean>(async (conn) => {
                const transfer = await this.transferRepo.findById(proposal.id!, conn);
                if (!transfer || transfer.matchingStatus !== 'PROPOSED') return false;
                const [best, ...otherCandidates] = transfer.matchingCandidates ?? [];
                if (!best) return false;
                const confidence = Math.round(best.score * 100);

                if (best.invoiceId) {
                    if (otherCandidates.some((candidate) => candidate.score >= best.score)) return false;
                    const result = await this.allocateSalesPayment(transfer, best.invoiceId, {
                        amount: transfer.amount, source: 'MANUAL', createdBy: userId, confidence,
                    }, conn);
                    if (!result) return false;
                    await this.transferRepo.updateMatchingStatus(transfer.id!, 'CONFIRMED', transfer.matchingScore, null, conn);
                    return true;
                }

                if (!best.costInvoiceId) return false;
                const alloc = new PaymentAllocation({
                    bankTransferId: transfer.id!,
                    costInvoiceId: best.costInvoiceId,
                    allocatedAmount: best.remainingAmount ?? transfer.amount,
                    allocatedPercentage: 100,
                    source: 'MANUAL',
                    confidence: best.score ? confidence : null,
                    createdBy: userId ?? null,
                });
                await this.allocationRepo.insert(alloc, conn);
                await this.transferRepo.updateMatchingStatus(transfer.id!, 'CONFIRMED', transfer.matchingScore, null, conn);
                await this.updateCostInvoicePaymentStatus(best.costInvoiceId, conn);
                return true;
            });
            if (didCommit) committed++;
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
                    offerAlias: bond._offerAlias ?? null,
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

        const invoiceId = body.invoiceId ? Number(body.invoiceId) : null;
        const costInvoiceId = body.costInvoiceId ? Number(body.costInvoiceId) : null;
        const amount = Number(body.amount);

        if (invoiceId) {
            return ToolsDb.transaction<AllocationResult>(async (conn) => {
                const transfer = await this.transferRepo.findById(transferId, conn);
                if (!transfer) throw new BankSyncError(404, `BankTransfer #${transferId} nie istnieje`);
                const result = await this.allocateSalesPayment(transfer, invoiceId, {
                    amount, source: 'MANUAL', createdBy: userId,
                }, conn);
                if (!result) {
                    const invoice = await this.invoiceRepo.lockPaymentInvoice(invoiceId, conn);
                    if (!invoice) throw new BankSyncError(404, `Faktura #${invoiceId} nie istnieje`);
                    if (invoice.CorrectedInvoiceId) {
                        throw new BankSyncError(400, 'Wpłatę przypisz do faktury oryginalnej');
                    }
                    throw new BankSyncError(400, 'Przelew lub faktura nie mają kwoty dostępnej do przypisania');
                }
                await this.transferRepo.updateMatchingStatus(transferId, 'CONFIRMED', null, null, conn);
                return result;
            });
        }

        const transfer = await this.transferRepo.findById(transferId);
        if (!transfer) throw new BankSyncError(404, `BankTransfer #${transferId} nie istnieje`);
        const costInvoice = await this.costInvoiceRepo.findById(costInvoiceId!);
        if (!costInvoice) throw new BankSyncError(404, `Faktura kosztowa #${costInvoiceId} nie istnieje`);
        const { grossAmount, paidAmount: alreadyPaid } = costInvoice;
        const remaining = Math.max(0, grossAmount - alreadyPaid);
        if (amount > remaining + 0.01) {
            throw new BankSyncError(400, `Kwota alokacji (${amount}) przekracza pozostałą kwotę faktury (${remaining})`);
        }

        const percentage = grossAmount > 0 ? Math.round((amount / grossAmount) * 10000) / 100 : 100;

        return ToolsDb.transaction<AllocationResult>(async (conn) => {
            const alloc = new PaymentAllocation({
                bankTransferId: transferId,
                costInvoiceId,
                allocatedAmount: amount,
                allocatedPercentage: percentage,
                source: 'MANUAL',
                createdBy: userId ?? null,
            });
            const allocationId = await this.allocationRepo.insert(alloc, conn);
            await this.transferRepo.updateMatchingStatus(transferId, 'CONFIRMED', null, null, conn);

            const state = await this.updateCostInvoicePaymentStatus(costInvoiceId!, conn);
            return {
                allocationId,
                costInvoiceId: costInvoiceId!,
                allocatedAmount: amount,
                allocatedPercentage: percentage,
                newPaymentStatus: state.paymentStatus,
                newPaidAmount: state.paidAmount,
            };
        });
    }

    async deleteAllocation(allocId: number): Promise<{ invoiceId?: number; costInvoiceId?: number }> {
        const alloc = await this.allocationRepo.findById(allocId);
        if (!alloc) throw new BankSyncError(404, `PaymentAllocation #${allocId} nie istnieje`);

        const { invoiceId, costInvoiceId, bankTransferId } = alloc;

        await ToolsDb.transaction(async (conn) => {
            if (invoiceId) await this.transferRepo.findById(bankTransferId, conn);
            const invoice = invoiceId ? await this.invoiceRepo.lockPaymentInvoice(invoiceId, conn) : null;
            await this.allocationRepo.delete(allocId, conn);

            // Recalculate payment status
            if (invoiceId && invoice && !invoice.CorrectedInvoiceId) {
                await InvoicesController.recalculatePayment(invoiceId, conn);
            }
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
    ): Promise<boolean> {
        const { allocatedAmount } = proposal;
        if (!allocatedAmount) return false;
        const invoiceId = proposal.invoiceId ?? null;
        const costInvoiceId = proposal.costInvoiceId ?? null;

        if (invoiceId) {
            const result = await this.allocateSalesPayment(transfer, invoiceId, {
                amount: transfer.amount,
                source: 'AUTO',
                confidence: Math.round(proposal.score * 100),
            }, conn);
            return result !== null;
        }

        const alloc = new PaymentAllocation({
            bankTransferId: transfer.id!,
            invoiceId,
            costInvoiceId,
            allocatedAmount,
            allocatedPercentage: 100,
            source: 'AUTO',
            confidence: Math.round(proposal.score * 100),
        });
        await this.allocationRepo.insert(alloc, conn);

        if (costInvoiceId) await this.updateCostInvoicePaymentStatus(costInvoiceId, conn);
        return true;
    }

    private async allocateSalesPayment(
        transfer: BankTransfer,
        invoiceId: number,
        request: {
            amount: number;
            source: PaymentAllocation['source'];
            createdBy?: number | null;
            confidence?: number;
        },
        conn: mysql.PoolConnection,
    ): Promise<AllocationResult | null> {
        if (transfer.direction !== 'IN' || !(await this.invoiceRepo.lockPaymentCandidate(invoiceId, conn))) return null;
        const due = await this.invoiceRepo.findDueAmount(invoiceId, conn);
        if (due === null || due <= 0) return null;

        const { paidAmount } = await this.allocationRepo.getInvoicePayment(invoiceId, conn);
        const transferAllocated = await this.allocationRepo.sumAllocatedForTransfer(transfer.id!, conn);
        const invoiceRemaining = Math.round((due - paidAmount) * 100);
        const transferRemaining = Math.round((transfer.amount - transferAllocated) * 100);
        if (request.source === 'AUTO' && !matchesSalesAmount(transferRemaining / 100, invoiceRemaining / 100)) return null;

        const allocatedCents = Math.min(Math.round(request.amount * 100), invoiceRemaining, transferRemaining);
        if (allocatedCents <= 0) return null;
        const allocatedAmount = allocatedCents / 100;
        const allocatedPercentage = Math.round((allocatedAmount / due) * 10000) / 100;
        const allocationId = await this.allocationRepo.insert(new PaymentAllocation({
            bankTransferId: transfer.id!,
            invoiceId,
            allocatedAmount,
            allocatedPercentage,
            source: request.source,
            confidence: request.confidence,
            createdBy: request.createdBy,
        }), conn);
        const state = await InvoicesController.recalculatePayment(invoiceId, conn);
        return {
            allocationId,
            invoiceId,
            allocatedAmount,
            allocatedPercentage,
            newPaymentStatus: state.paymentStatus,
            newPaidAmount: state.paidAmount,
        };
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
        if (paidAmount <= 0) paymentStatus = Setup.InvoicePaymentStatus.UNPAID;
        else if (Math.abs(paidAmount - grossAmount) <= 0.01) paymentStatus = Setup.InvoicePaymentStatus.PAID;
        else paymentStatus = Setup.InvoicePaymentStatus.PARTIALLY_PAID;

        await this.costInvoiceRepo.updatePayment(costInvoiceId, { paymentStatus, paidAmount }, conn);
        return { paymentStatus, paidAmount };
    }
}
