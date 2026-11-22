import { createHash, randomUUID } from 'crypto';
import { setImmediate } from 'node:timers/promises';
import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import { PkoBpXmlParser, type PkoBpOperation } from './parsers/PkoBpXmlParser';
import BankStatement from './BankStatement';
import BankTransfer, { FEE_TYPES, isExactInvoiceCandidate, MatchingCandidate, MatchingStatus, supportsInvoiceQueue } from './BankTransfer';
import PaymentAllocation from './PaymentAllocation';
import BankStatementRepository from './BankStatementRepository';
import BankTransferRepository, { BankTransferInsertWarning } from './BankTransferRepository';
import PaymentAllocationRepository from './PaymentAllocationRepository';
import { TransferMatcher, CandidatePool, MatchProposal } from './matching/TransferMatcher';
import { invoiceNumberSignal, matchesSalesAmount } from './matching/signals';
import InvoiceRepository from '../invoices/InvoiceRepository';
import InvoicesController from '../invoices/InvoicesController';
import CostInvoiceRepository from '../costInvoices/CostInvoiceRepository';
import { BankSyncValidator } from './BankSyncValidator';
import { extractInvoiceNumbers } from './parsers/pkoBpDescriptionHelpers';
import OfferBondRepository from '../offers/OfferBond/OfferBondRepository';
import Setup from '../setup/Setup';
import { statementCoverage } from './statementCoverage';
import { reconcileOperations } from './operationReconciliation';

const SAMPLE_SEED = 'bnk-b2-v1';
const IMPORT_RESULT_TTL_MS = 60 * 60 * 1000;
const IMPORT_TIMEOUT_MS = 10 * 60 * 1000;

type MatchableTransfer = Pick<BankTransfer, 'direction' | 'amount' | 'currency' | 'execDate' |
    'counterpartyAccount' | 'counterpartyName' | 'counterpartyNip' | 'description' | 'title' | 'operationType' | 'reviewAsPayment'>;

function compareTransferOrder(a: Pick<BankTransfer, 'execDate' | 'operationHash'>, b: typeof a): number {
    return a.execDate.localeCompare(b.execDate) || a.operationHash.localeCompare(b.operationHash);
}

interface SalesAllocation {
    allocation: AllocationResult & { invoiceId: number };
    invoiceNumber: string | null;
    dueAmount: number;
    previousStatus: string;
    status: string;
}

export interface UploadPreview {
    statementId: number;
    total: number;
    alreadyKnown: number;
    needsReview: number;
    reviewOperations: Pick<PkoBpOperation, 'fileOperationNumber' | 'execDate' | 'amount' | 'currency' | 'direction'>[];
    autoMatched: number;
    proposed: number;
    unmatched: number;
    fees: number;
    foreignCurrency: number;
    periodFrom: string;
    periodTo: string;
    gaps: ReturnType<typeof statementCoverage>['gaps'];
    incomeMatched: number;
    incomePending: number;
    ownTransfers: number;
    expenses: number;
    otherIncoming: number;
}

type ImportResult = { status: 'done'; result: UploadPreview }
    | { status: 'failed'; error: string };
type ImportJob = { status: 'running' } | ImportResult;

interface PreparedUpload {
    rawChecksum: string;
    document: ReturnType<typeof PkoBpXmlParser.readDocument>;
}

export interface AllocationResult {
    allocationId: number;
    invoiceId?: number;
    costInvoiceId?: number;
    allocatedAmount: number;
    allocatedPercentage: number;
    newPaymentStatus: string;
    newPaidAmount: number;
    transferRemaining?: number;
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
    // shortcut: stan importu jest w pamięci jednego procesu, użyj wspólnej kolejki przy wielu dynach web.
    private importJobs = new Map<string, ImportJob>();
    private activeImportId?: string;

    private today() {
        return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw' }).format(new Date());
    }

    async listStatements() {
        const statements = await this.statementRepo.find();
        const byAccount = new Map<string, typeof statements>();
        for (const statement of statements) {
            const account = byAccount.get(statement.accountNumber) ?? [];
            account.push(statement);
            byAccount.set(statement.accountNumber, account);
        }
        const today = this.today();
        return Array.from(byAccount, ([accountNumber, statements]) => ({
            accountNumber, statements, ...statementCoverage(statements, today),
        }));
    }

    async getInvoicePayments(id: number) {
        const paidManually = await this.invoiceRepo.findPaymentMarker(id);
        const dueAmount = paidManually === null ? null : await this.invoiceRepo.findDueAmount(id);
        if (dueAmount === null) throw new BankSyncError(404, 'Nie znaleziono faktury oryginalnej');
        return { paidManually, dueAmount, payments: await this.allocationRepo.findInvoicePayments(id) };
    }

    // =====================================================
    // UPLOAD (parse → persist transfers → run matcher → return preview)
    // =====================================================

    assertImportAvailable(): void {
        if (this.activeImportId) {
            throw new BankSyncError(409, 'Trwa wgrywanie innego wyciągu. Zaczekaj na jego zakończenie.');
        }
    }

    async startUpload(buffer: Buffer, fileName: string, userId?: number | null): Promise<{ jobId: string }> {
        this.assertImportAvailable();
        const jobId = randomUUID();
        this.activeImportId = jobId;
        try {
            const prepared = await this.prepareUpload(buffer);
            this.importJobs.set(jobId, { status: 'running' });
            void this.runImport(jobId, prepared, fileName, userId);
            return { jobId };
        } catch (error) {
            this.activeImportId = undefined;
            throw error;
        }
    }

    getImportStatus(jobId: string): ImportJob {
        const job = this.importJobs.get(jobId);
        if (!job) {
            throw new BankSyncError(404, 'Nie można odczytać wyniku wgrywania. Sprawdź listę wyciągów. Jeśli wyciągu tam nie ma, wgraj plik ponownie.');
        }
        return job;
    }

    private async runImport(jobId: string, prepared: PreparedUpload, fileName: string, userId?: number | null) {
        const timeout = setTimeout(() => {
            // Limit zwalnia blokadę przyjmowania plików. Trwająca transakcja nadal zatwierdzi cały import
            // albo go wycofa przy błędzie. Jej spóźniony wynik nie nadpisze stanu ani blokady kolejnego zadania.
            this.finishImport(jobId, {
                status: 'failed',
                error: 'Wgrywanie przekroczyło limit czasu. Sprawdź zakładkę Wyciągi, zanim wgrasz plik ponownie.',
            });
        }, IMPORT_TIMEOUT_MS).unref();

        try {
            await setImmediate();
            const result = await this.persistUpload(prepared, fileName, userId);
            this.finishImport(jobId, { status: 'done', result });
        } catch (error) {
            // Sterownik bazy dołącza do błędu zapytanie z danymi wyciągu.
            const code = error instanceof Error && 'code' in error ? error.code : undefined;
            console.error(`[BankSync] Wgrywanie wyciągu ${jobId} nie powiodło się`,
                code ?? (error instanceof Error ? error.name : undefined));
            const message = error instanceof BankTransferInsertWarning
                ? 'Operacja z pliku ma pole dłuższe, niż przyjmuje system - import wycofany, nic nie zapisano.'
                : error instanceof BankSyncError ? error.message :
                    'Nie udało się wgrać wyciągu. Sprawdź listę wyciągów i spróbuj ponownie.';
            this.finishImport(jobId, { status: 'failed', error: message });
        } finally {
            clearTimeout(timeout);
        }
    }

    private finishImport(jobId: string, result: ImportResult): void {
        if (this.importJobs.get(jobId)?.status !== 'running') return;
        this.importJobs.set(jobId, result);
        if (this.activeImportId === jobId) this.activeImportId = undefined;
        setTimeout(() => this.importJobs.delete(jobId), IMPORT_RESULT_TTL_MS).unref();
    }

    async upload(buffer: Buffer, fileName: string, userId?: number | null): Promise<UploadPreview> {
        return this.persistUpload(await this.prepareUpload(buffer), fileName, userId);
    }

    private async prepareUpload(buffer: Buffer): Promise<PreparedUpload> {
        const rawChecksum = createHash('sha256').update(buffer).digest('hex');

        // Idempotency: reject duplicate files
        const existing = await this.statementRepo.findByChecksum(rawChecksum);
        if (existing) {
            throw new BankSyncError(409, 'Ten plik został już wgrany');
        }

        try {
            return { rawChecksum, document: PkoBpXmlParser.readDocument(buffer) };
        } catch {
            throw new BankSyncError(400, 'Wybierz prawidłowy plik XML z historią rachunku PKO BP.');
        }
    }

    private async withImportTransaction(account: string, work: (conn: mysql.PoolConnection) => Promise<void>): Promise<void> {
        const conn = await ToolsDb.pool.getConnection();
        try {
            // Serialize the candidate read and writes for this account, including the commit.
            if (!await this.statementRepo.acquireImportLock(account, conn)) {
                throw new BankSyncError(409, 'Trwa wgrywanie innego wyciągu dla tego rachunku. Spróbuj ponownie za chwilę.');
            }
            try {
                // Read invoice balances after obtaining the invoice lock, even after earlier import reads.
                await conn.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
                await conn.beginTransaction();
                try {
                    await work(conn);
                    await conn.commit();
                } catch (error) {
                    await conn.rollback();
                    throw error;
                }
            } finally {
                try {
                    await this.statementRepo.releaseImportLock(account, conn);
                } catch {
                    // Closing the connection also releases its advisory lock.
                    conn.destroy();
                }
            }
        } finally {
            conn.release();
        }
    }

    private async persistUpload(prepared: PreparedUpload, fileName: string, userId?: number | null): Promise<UploadPreview> {
        try {
            return await this.persistUploadAttempt(prepared, fileName, userId);
        } catch (error) {
            if (!(error instanceof Error && 'code' in error && error.code === 'ER_LOCK_DEADLOCK')) throw error;
            return this.persistUploadAttempt(prepared, fileName, userId);
        }
    }

    private async persistUploadAttempt({ rawChecksum, document }: PreparedUpload, fileName: string, userId?: number | null): Promise<UploadPreview> {
        const parsed = PkoBpXmlParser.parseOperations(document);

        const preview: UploadPreview = {
            statementId: 0,
            total: 0,
            alreadyKnown: 0,
            needsReview: 0,
            reviewOperations: [],
            autoMatched: 0,
            proposed: 0,
            unmatched: 0,
            fees: 0,
            foreignCurrency: 0,
            periodFrom: parsed.periodFrom,
            periodTo: parsed.periodTo,
            gaps: [],
            incomeMatched: 0,
            incomePending: 0,
            ownTransfers: 0,
            expenses: 0,
            otherIncoming: 0,
        };

        // Determine closing balance (last endingBalance in file)
        let closingBalance: number | null = null;
        for (const op of parsed.operations) {
            if (op.endingBalance !== null) closingBalance = op.endingBalance;
        }

        const operations = [...parsed.operations].sort(compareTransferOrder);
        const directions = new Set(operations
            .filter((op) => op.currency === 'PLN' && !FEE_TYPES.has(op.operationType))
            .map((op) => op.direction));
        // Wstępny odczyt kandydatów nie otwiera migawki transakcji zapisującej wpłaty.
        const pool = await this.matcher.loadCandidates(directions);
        const ops: { op: PkoBpOperation; proposal: MatchProposal | null }[] = [];
        for (const [index, op] of operations.entries()) {
            // Pozwól serwerowi obsłużyć inne żądania w trakcie obliczania propozycji.
            if (index > 0 && index % 25 === 0) await setImmediate();
            ops.push({ op, proposal: this.proposeTransfer(op, pool) });
        }

        await this.withImportTransaction(parsed.ourAccount, async (conn) => {
            if (await this.statementRepo.findByChecksum(rawChecksum, conn)) {
                throw new BankSyncError(409, 'Ten plik został już wgrany');
            }
            const existing = operations.length ? await this.transferRepo.findImportOperations(
                parsed.ourAccount, operations[0].execDate, operations[operations.length - 1].execDate, conn,
            ) : [];
            const importMatches = reconcileOperations(operations, existing, parsed);
            const affectedSalesInvoices = new Set<number>();
            const confirmedTransfers: number[] = [];

            const statement = new BankStatement({
                fileName,
                ourAccountNumber: parsed.ourAccount,
                periodFrom: parsed.periodFrom,
                periodTo: parsed.periodTo,
                closingBalance,
                importedBy: userId ?? null,
                rawChecksum,
            });
            preview.statementId = await this.statementRepo.insert(statement, conn);

            for (const { op, proposal } of ops) {
                const match = importMatches.get(op.operationHash);
                if (match?.kind === 'known') {
                    if (parsed.periodTo > match.existing.confirmedThrough) confirmedTransfers.push(match.existing.id);
                    preview.alreadyKnown++;
                    continue;
                }
                if (match?.kind === 'shifted') {
                    if (parsed.periodTo > match.existing.confirmedThrough) {
                        await this.transferRepo.updateImportedOperation(match.existing.id, op, {
                            periodFrom: parsed.periodFrom, periodTo: parsed.periodTo,
                        }, conn);
                        if (supportsInvoiceQueue(op)) {
                            const ids = await this.allocationRepo.findSalesInvoiceIdsForTransfer(match.existing.id, conn);
                            for (const id of ids) affectedSalesInvoices.add(id);
                        }
                    }
                    preview.alreadyKnown++;
                    continue;
                }

                const matching = this.matchingFields(proposal);
                // Keep ambiguous operations out of bulk confirmation, with individual allocation still available.
                if (match?.kind === 'ambiguous' && matching.status !== 'MANUAL') matching.status = 'UNMATCHED';

                const transfer = new BankTransfer({
                    bankStatementId: preview.statementId,
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
                    matchingStatus: matching.status,
                    matchingScore: matching.score,
                    matchingCandidates: matching.candidates,
                    importNeedsReview: match?.kind === 'ambiguous',
                });

                const transferId = await this.transferRepo.insert(transfer, conn, op.fileOperationNumber);
                if (!transferId) {
                    preview.alreadyKnown++;
                    continue;
                }

                transfer.id = transferId;
                preview.total++;
                if (match?.kind === 'ambiguous') {
                    const { fileOperationNumber, execDate, amount, currency, direction } = op;
                    preview.reviewOperations.push({ fileOperationNumber, execDate, amount, currency, direction });
                }
                if (FEE_TYPES.has(op.operationType)) preview.fees++;
                if (op.currency !== 'PLN') preview.foreignCurrency++;
                let status = matching.status;

                if (matching.status === 'CONFIRMED' && proposal) {
                    const allocated = await this.persistAutoAllocation(transfer, proposal, conn);
                    if (allocated) {
                        preview.autoMatched++;
                        if ((allocated.sale?.allocation.transferRemaining ?? 0) > 0) status = 'PROPOSED';
                    } else {
                        await this.transferRepo.updateMatchingStatus(
                            transferId, 'PROPOSED', matching.score, matching.candidates, conn,
                        );
                        preview.proposed++;
                        status = 'PROPOSED';
                    }
                } else if (matching.status === 'PROPOSED') {
                    preview.proposed++;
                } else if (matching.status === 'UNMATCHED') {
                    preview.unmatched++;
                }

                if (FEE_TYPES.has(op.operationType)) continue;
                if (proposal?.flags?.includes('OWN_TRANSFER')) preview.ownTransfers++;
                else if (op.direction === 'OUT') preview.expenses++;
                else if (status === 'CONFIRMED') preview.incomeMatched++;
                else if (status === 'MANUAL') preview.otherIncoming++;
                else preview.incomePending++;
            }
            if (confirmedTransfers.length) await this.transferRepo.confirmImportPeriod(confirmedTransfers, parsed.periodTo, conn);
            for (const id of [...affectedSalesInvoices].sort((a, b) => a - b)) {
                const invoice = await this.invoiceRepo.lockPaymentInvoice(id, conn);
                if (invoice && !invoice.CorrectedInvoiceId) await InvoicesController.recalculatePayment(id, conn);
            }
            const periods = await this.statementRepo.findPeriods(conn, parsed.ourAccount);
            preview.gaps = statementCoverage(periods, this.today()).gaps;
        });

        preview.needsReview = preview.reviewOperations.length;
        preview.reviewOperations.sort((a, b) => a.fileOperationNumber - b.fileOperationNumber);
        return preview;
    }

    /** Runs inside the transaction owned by the command. */
    async recalculateIncoming(conn: mysql.PoolConnection) {
        const transfers = (await this.transferRepo.lockUnallocatedIncoming(conn)).sort(compareTransferOrder);
        const pool = await this.matcher.loadCandidates(new Set(['IN']), conn);
        const eligibleIds = new Set(pool.invoices.map((invoice) => invoice.Id));
        const statuses = Setup.InvoiceStatus;
        const counts = {
            analyzed: transfers.length,
            automatic: 0,
            attachedToAlreadyPaid: 0,
            newlyPaid: 0,
            partial: 0,
            partialProposals: 0,
            proposals: 0,
            withoutCandidate: 0,
            ownTransfers: 0,
            otherManual: 0,
            rejectedByAllocationGuard: 0,
        };
        const newlyPaidByPreviousStatus: Record<string, number> = Object.fromEntries(
            Setup.InvoicePayableStatuses.map((status) => [status, 0]),
        );
        const byStatement: Record<number, { analyzed: number; automatic: number; rejectedByAllocationGuard: number }> = {};
        const statusChanges: Array<{
            invoiceNumber: string | null; previousStatus: string; dueAmount: number; allocatedAmount: number; date: string;
        }> = [];
        const sample: Array<{
            rank: string; invoiceNumber: string | null; title: string | null;
            titleSource: 'title' | 'bank-reference' | null; amount: number; date: string;
        }> = [];
        let allocationsOutsidePool = 0;

        for (const transfer of transfers) {
            const statement = byStatement[transfer.bankStatementId] ??= {
                analyzed: 0, automatic: 0, rejectedByAllocationGuard: 0,
            };
            statement.analyzed++;
            const proposal = this.proposeTransfer(transfer, pool);
            const matching = this.matchingFields(proposal);
            const result = proposal?.status === 'CONFIRMED'
                ? await this.persistAutoAllocation(transfer, proposal, conn)
                : null;

            if (result?.sale) {
                const { allocation, invoiceNumber, previousStatus, status, dueAmount } = result.sale;
                const { invoiceId, allocatedAmount, newPaymentStatus } = allocation;
                counts.automatic++;
                statement.automatic++;
                if (!eligibleIds.has(invoiceId)) allocationsOutsidePool++;
                if (newPaymentStatus === Setup.InvoicePaymentStatus.PARTIALLY_PAID) counts.partial++;
                if (previousStatus === statuses.PAID) counts.attachedToAlreadyPaid++;
                else if (status === statuses.PAID) {
                    counts.newlyPaid++;
                    newlyPaidByPreviousStatus[previousStatus]++;
                    statusChanges.push({ invoiceNumber, previousStatus, dueAmount, allocatedAmount, date: transfer.execDate });
                }
                const title = transfer.title?.trim();
                const bankReference = title ? null : this.transferInvoiceNumbers(transfer)[0];
                sample.push({
                    rank: createHash('sha256').update(`${SAMPLE_SEED}:${transfer.operationHash}`).digest('hex'),
                    invoiceNumber,
                    title: (title || bankReference)?.replace(/\s+/g, ' ').slice(0, 100) ?? null,
                    titleSource: title ? 'title' : bankReference ? 'bank-reference' : null,
                    amount: transfer.amount, date: transfer.execDate,
                });
            } else if (matching.status === 'MANUAL') {
                if (proposal?.flags?.includes('OWN_TRANSFER')) counts.ownTransfers++;
                else counts.otherManual++;
            } else if (matching.status === 'CONFIRMED') {
                matching.status = 'PROPOSED';
                counts.rejectedByAllocationGuard++;
                statement.rejectedByAllocationGuard++;
                counts.proposals++;
            } else if (matching.status === 'PROPOSED') {
                counts.proposals++;
                const invoiceNumbers = this.transferInvoiceNumbers(transfer);
                if (matching.candidates?.some((candidate) =>
                    invoiceNumberSignal(invoiceNumbers, candidate.invoiceNumber) === 1 &&
                    (candidate.remainingAmount ?? 0) - transfer.amount > 0.01,
                )) counts.partialProposals++;
            } else {
                counts.withoutCandidate++;
            }

            await this.transferRepo.updateMatchingStatus(
                transfer.id!, matching.status, matching.score, matching.candidates, conn,
            );
        }

        const overallocatedInvoices = await this.invoiceRepo.countOverallocatedInvoices(conn);
        const overallocatedTransfers = await this.allocationRepo.countOverallocatedTransfers(conn);
        return {
            counts, newlyPaidByPreviousStatus, byStatement, statusChanges,
            sampleSeed: SAMPLE_SEED,
            automaticSample: sample.sort((a, b) => a.rank.localeCompare(b.rank)).slice(0, 20)
                .map(({ rank, ...entry }) => entry),
            invariants: { allocationsOutsidePool, overallocatedInvoices, overallocatedTransfers },
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
                    const exact = isExactInvoiceCandidate(best);
                    if (otherCandidates.some(candidate =>
                        candidate.score >= best.score || (exact && isExactInvoiceCandidate(candidate)),
                    )) return false;
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
        const transfers = await this.transferRepo.findPending();
        if (!transfers.length) return [];
        const pool = await this.matcher.loadCandidates(new Set(['IN']));
        const prepare = (rows: typeof transfers) => rows.flatMap(transfer => {
            if (transfer.importNeedsReview) return [{ ...transfer, matchingCandidates: [] }];
            const proposal = this.proposeTransfer({ ...transfer, amount: transfer.remainingAmount }, pool);
            if (!proposal || proposal.flags?.includes('OWN_TRANSFER')) return [];
            const [best] = proposal.candidates;
            const exact = proposal.candidates.filter(isExactInvoiceCandidate);
            const proposed = proposal.status !== 'UNMATCHED' && !!best;
            return [{
                ...transfer,
                matchingStatus: (proposed ? 'PROPOSED' : 'UNMATCHED') as MatchingStatus,
                matchingCandidates: proposed
                    ? exact.length ? exact : proposal.candidates.filter(c => c.score === best.score)
                    : best && best.score > 0 ? [best] : [],
            }];
        });
        const result: ReturnType<typeof prepare> = [];
        for (let start = 0; start < transfers.length; start += 25) {
            if (start > 0) await setImmediate();
            result.push(...prepare(transfers.slice(start, start + 25)));
        }
        return result;
    }

    async dismissIncomingTransfer(id: number, expectedRemaining: number, expectedOperationHash?: string) {
        await ToolsDb.transaction(async conn => {
            const transfer = await this.transferRepo.findById(id, conn);
            if (!transfer) throw new BankSyncError(404, 'Nie znaleziono przelewu');
            if ((expectedOperationHash !== undefined || transfer.importNeedsReview) &&
                (!transfer.importNeedsReview || expectedOperationHash !== transfer.operationHash)) {
                throw new BankSyncError(409, 'Status sprawdzania się zmienił. Odśwież kolejkę.');
            }
            if (!transfer.importNeedsReview && !supportsInvoiceQueue(transfer)) {
                throw new BankSyncError(400, 'Przelew nie należy do kolejki decyzji');
            }
            const allocated = await this.allocationRepo.sumAllocatedForTransfer(id, conn);
            if ((!transfer.importNeedsReview && (transfer.matchingStatus === 'MANUAL' || expectedRemaining <= 0)) ||
                Math.round((transfer.amount - allocated) * 100) !== Math.round(expectedRemaining * 100)) {
                throw new BankSyncError(409, 'Przelew się zmienił. Odśwież kolejkę.');
            }
            if (transfer.importNeedsReview) {
                await this.transferRepo.clearImportReview(id, conn);
                return;
            }
            // Pusta lista odróżnia decyzję użytkownika od opłat i przelewów własnych.
            await this.transferRepo.updateMatchingStatus(id, 'MANUAL', null, [], conn);
        });
    }

    async restoreIncomingTransfer(id: number) {
        await ToolsDb.transaction(async conn => {
            const transfer = await this.transferRepo.findById(id, conn);
            if (!transfer) throw new BankSyncError(404, 'Nie znaleziono przelewu');
            if (!supportsInvoiceQueue(transfer) || transfer.matchingStatus !== 'MANUAL') {
                throw new BankSyncError(409, 'Tego przelewu nie można przywrócić do kolejki.');
            }
            if ((await this.allocationRepo.findByTransferId(id, conn)).length > 0) {
                throw new BankSyncError(409, 'Najpierw odepnij wpłaty przypisane do tego przelewu.');
            }
            await this.transferRepo.updateMatchingStatus(id, 'UNMATCHED', null, null, conn, true);
        });
    }

    private async lockAssignableTransfer(id: number, conn: mysql.PoolConnection) {
        const transfer = await this.transferRepo.findById(id, conn);
        if (!transfer) throw new BankSyncError(404, 'Nie znaleziono przelewu');
        if (transfer.matchingStatus === 'MANUAL' && supportsInvoiceQueue(transfer)) {
            throw new BankSyncError(409, 'Najpierw wybierz „Przywróć do kolejki” na zakładce „Wszystkie przelewy”.');
        }
        if (transfer.matchingStatus === 'MANUAL' || transfer.currency !== 'PLN') {
            throw new BankSyncError(409, 'Tego przelewu nie można przypisać do faktury');
        }
        return transfer;
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
                const transfer = await this.lockAssignableTransfer(transferId, conn);
                const result = await this.allocateSalesPayment(transfer, invoiceId, {
                    amount, source: 'MANUAL', createdBy: userId,
                    expectedRemaining: body.expectedRemaining === undefined ? undefined : Number(body.expectedRemaining),
                }, conn);
                if (!result) {
                    const invoice = await this.invoiceRepo.lockPaymentInvoice(invoiceId, conn);
                    if (!invoice) throw new BankSyncError(404, 'Nie znaleziono faktury');
                    if (invoice.CorrectedInvoiceId) {
                        throw new BankSyncError(400, 'Wpłatę przypisz do faktury oryginalnej');
                    }
                    throw new BankSyncError(400, 'Przelew lub faktura nie mają kwoty dostępnej do przypisania');
                }
                await this.transferRepo.updateMatchingStatus(transferId, 'CONFIRMED', null, null, conn);
                return result.allocation;
            });
        }

        const costInvoice = await this.costInvoiceRepo.findById(costInvoiceId!);
        if (!costInvoice) throw new BankSyncError(404, 'Nie znaleziono faktury kosztowej');
        const { grossAmount, paidAmount: alreadyPaid } = costInvoice;
        const remaining = Math.max(0, grossAmount - alreadyPaid);
        if (amount > remaining + 0.01) {
            throw new BankSyncError(400, 'Kwota do przypisania przekracza pozostałą należność faktury kosztowej');
        }

        const percentage = grossAmount > 0 ? Math.round((amount / grossAmount) * 10000) / 100 : 100;

        return ToolsDb.transaction<AllocationResult>(async (conn) => {
            await this.lockAssignableTransfer(transferId, conn);
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

    async deleteAllocation(allocId: number, transferId?: number): Promise<{ invoiceId?: number; costInvoiceId?: number }> {
        const alloc = await this.allocationRepo.findById(allocId);
        if (!alloc || (transferId !== undefined && alloc.bankTransferId !== transferId))
            throw new BankSyncError(404, 'Nie znaleziono przypisanej wpłaty');

        const { invoiceId, costInvoiceId, bankTransferId } = alloc;

        await ToolsDb.transaction(async (conn) => {
            const transfer = await this.transferRepo.findById(bankTransferId, conn);
            const invoice = invoiceId ? await this.invoiceRepo.lockPaymentInvoice(invoiceId, conn) : null;
            await this.allocationRepo.delete(allocId, conn);

            // Recalculate payment status
            if (invoiceId && invoice && !invoice.CorrectedInvoiceId) {
                await InvoicesController.recalculatePayment(invoiceId, conn);
            }
            if (costInvoiceId) await this.updateCostInvoicePaymentStatus(costInvoiceId, conn);

            // If no more allocations, reset transfer to UNMATCHED
            const remaining = await this.allocationRepo.findByTransferId(bankTransferId, conn);
            if (remaining.length === 0 && transfer?.matchingStatus !== 'MANUAL') {
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

    private transferInvoiceNumbers(transfer: MatchableTransfer): string[] {
        const description = transfer.description || (transfer.title ? `Tytuł : ${transfer.title}` : '');
        return extractInvoiceNumbers(description, transfer.direction === 'OUT');
    }

    private proposeTransfer(transfer: MatchableTransfer, pool: CandidatePool): MatchProposal | null {
        if (transfer.currency !== 'PLN' || FEE_TYPES.has(transfer.operationType)) return null;
        return this.matcher.propose({
            direction: transfer.direction,
            amount: transfer.amount,
            currency: transfer.currency,
            execDate: transfer.execDate,
            counterpartyAccount: transfer.counterpartyAccount ?? null,
            counterpartyName: transfer.counterpartyName ?? null,
            counterpartyNip: transfer.counterpartyNip ?? null,
            invoiceNumbers: this.transferInvoiceNumbers(transfer),
            reviewAsPayment: transfer.reviewAsPayment,
        }, pool);
    }

    private matchingFields(proposal: MatchProposal | null): {
        status: MatchingStatus; score: number | null; candidates: MatchingCandidate[] | null;
    } {
        if (!proposal || proposal.flags?.includes('OWN_TRANSFER')) {
            return { status: 'MANUAL', score: null, candidates: null };
        }
        return { status: proposal.status, score: Math.round(proposal.score * 100), candidates: proposal.candidates };
    }

    private async persistAutoAllocation(
        transfer: BankTransfer,
        proposal: MatchProposal,
        conn: mysql.PoolConnection,
    ): Promise<{ sale?: SalesAllocation } | null> {
        const { allocatedAmount } = proposal;
        if (!allocatedAmount) return null;
        const invoiceId = proposal.invoiceId ?? null;
        const costInvoiceId = proposal.costInvoiceId ?? null;

        if (invoiceId) {
            const result = await this.allocateSalesPayment(transfer, invoiceId, {
                amount: transfer.amount,
                source: 'AUTO',
                confidence: Math.round(proposal.score * 100),
            }, conn);
            return result ? { sale: result } : null;
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
        return {};
    }

    private async allocateSalesPayment(
        transfer: BankTransfer,
        invoiceId: number,
        request: {
            amount: number;
            source: PaymentAllocation['source'];
            createdBy?: number | null;
            confidence?: number;
            expectedRemaining?: number;
        },
        conn: mysql.PoolConnection,
    ): Promise<SalesAllocation | null> {
        if (transfer.direction !== 'IN') return null;
        const invoice = await this.invoiceRepo.lockPaymentCandidate(invoiceId, conn);
        if (!invoice) return null;
        const due = await this.invoiceRepo.findDueAmount(invoiceId, conn);
        if (due === null || due <= 0) return null;

        const { paidAmount } = await this.allocationRepo.getInvoicePayment(invoiceId, conn);
        const transferAllocated = await this.allocationRepo.sumAllocatedForTransfer(transfer.id!, conn);
        const invoiceRemaining = Math.round((due - paidAmount) * 100);
        const transferRemaining = Math.round((transfer.amount - transferAllocated) * 100);
        if (request.expectedRemaining !== undefined &&
            transferRemaining !== Math.round(request.expectedRemaining * 100)) {
            throw new BankSyncError(409, 'Kwota do przypisania się zmieniła. Odśwież przelew.');
        }
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
            allocation: {
                allocationId, invoiceId, allocatedAmount, allocatedPercentage,
                newPaymentStatus: state.paymentStatus, newPaidAmount: state.paidAmount,
                transferRemaining: (transferRemaining - allocatedCents) / 100,
            },
            invoiceNumber: invoice.Number,
            previousStatus: invoice.Status,
            status: state.status,
            dueAmount: due,
        };
    }

    /** Recalculate CostInvoice payment status from allocations and update DB. */
    private async updateCostInvoicePaymentStatus(
        costInvoiceId: number,
        conn: mysql.PoolConnection,
    ): Promise<{ paymentStatus: string; paidAmount: number }> {
        const ci = await this.costInvoiceRepo.findById(costInvoiceId, conn);
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
