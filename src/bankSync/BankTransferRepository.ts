import ToolsDb from '../tools/ToolsDb';
import mysql from 'mysql2/promise';
import BankTransfer, { MatchingCandidate, MatchingStatus, supportsInvoiceQueue } from './BankTransfer';
import { EXECUTION_DATE_WINDOW_DAYS, type StatementPeriod, type StoredOperation } from './operationReconciliation';
import type { PkoBpOperation } from './parsers/PkoBpXmlParser';

const transferInsertColumns = [
    'BankStatementId', 'OrderDate', 'ExecDate', 'OperationType', 'Direction', 'Amount', 'Currency',
    'CounterpartyAccount', 'CounterpartyName', 'CounterpartyNip', 'Title', 'Description',
    'OperationHash', 'MatchingStatus', 'MatchingScore', 'MatchingCandidates', 'ReviewAsPayment', 'ImportNeedsReview',
];

export class BankTransferInsertWarning extends Error {}

export const pendingTransfersSql = `
    SELECT bt.*, bt.Amount - COALESCE(allocated.Total, 0) AS RemainingAmount
    FROM BankTransfers bt
    LEFT JOIN (
        SELECT BankTransferId, SUM(AllocatedAmount) AS Total
        FROM PaymentAllocations GROUP BY BankTransferId
    ) allocated ON allocated.BankTransferId = bt.Id
    WHERE (bt.Direction = 'IN' AND bt.Currency = 'PLN' AND bt.MatchingStatus <> 'MANUAL'
      AND bt.Amount > COALESCE(allocated.Total, 0))
      OR bt.ImportNeedsReview = 1
`;

export interface BankTransferFilters {
    searchText?: string;
    matchingStatus?: MatchingStatus;
    direction?: 'IN' | 'OUT';
    dateFrom?: string;
    dateTo?: string;
}

export default class BankTransferRepository {
    async findByHash(hash: string): Promise<BankTransfer | null> {
        const sql = mysql.format(
            'SELECT * FROM BankTransfers WHERE OperationHash = ? LIMIT 1',
            [hash],
        );
        const rows = (await ToolsDb.getQueryCallbackAsync(sql)) as any[];
        if (!rows || rows.length === 0) return null;
        return this.mapRow(rows[0]);
    }

    async findImportOperations(account: string, firstDate: string, lastDate: string, conn: mysql.PoolConnection): Promise<StoredOperation[]> {
        const [rows] = await conn.query<mysql.RowDataPacket[]>(`
            SELECT bt.Id AS id, DATE_FORMAT(bt.OrderDate, '%Y-%m-%d') AS orderDate,
                DATE_FORMAT(bt.ExecDate, '%Y-%m-%d') AS execDate, bt.OperationType AS operationType,
                bt.Direction AS direction, bt.Amount AS amount, bt.Currency AS currency,
                bt.CounterpartyAccount AS counterpartyAccount, bt.Description AS description,
                bt.OperationHash AS operationHash,
                DATE_FORMAT(COALESCE(bt.VersionSourceFrom, bs.PeriodFrom), '%Y-%m-%d') AS periodFrom,
                DATE_FORMAT(COALESCE(bt.VersionSourceTo, bs.PeriodTo), '%Y-%m-%d') AS periodTo,
                DATE_FORMAT(COALESCE(bt.VersionConfirmedThrough, bt.VersionSourceTo, bs.PeriodTo), '%Y-%m-%d') AS confirmedThrough
            FROM BankTransfers bt JOIN BankStatements bs ON bs.Id = bt.BankStatementId
            WHERE bs.OurAccountNumber = ?
              AND bt.ExecDate BETWEEN DATE_SUB(?, INTERVAL ? DAY) AND DATE_ADD(?, INTERVAL ? DAY)
        `, [account, firstDate, EXECUTION_DATE_WINDOW_DAYS, lastDate, EXECUTION_DATE_WINDOW_DAYS]);
        return rows.map(row => ({ ...row, amount: Number(row.amount) }) as StoredOperation);
    }

    async updateImportedOperation(id: number, operation: PkoBpOperation, period: StatementPeriod, conn: mysql.PoolConnection): Promise<void> {
        // Record the accepted version's source without moving the transfer to a different statement.
        const [result] = await conn.query<mysql.ResultSetHeader>(`
            UPDATE BankTransfers SET OrderDate = ?, ExecDate = ?, Title = ?, Description = ?, OperationHash = ?,
                CounterpartyName = ?, CounterpartyNip = ?,
                VersionSourceFrom = ?, VersionSourceTo = ?, VersionConfirmedThrough = ?
            WHERE Id = ?
        `, [
            operation.orderDate, operation.execDate, operation.title, operation.description, operation.operationHash,
            operation.counterpartyName, operation.counterpartyNip, period.periodFrom, period.periodTo, period.periodTo, id,
        ]);
        if (result.affectedRows !== 1) throw new Error('Could not update the imported bank transfer');
        await this.checkWriteWarnings(result, conn, operation.fileOperationNumber);
    }

    async confirmImportPeriod(ids: number[], periodTo: string, conn: mysql.PoolConnection): Promise<void> {
        // Exact matches advance the version cutoff, but do not change the source used to check date coverage.
        await conn.query(`
            UPDATE BankTransfers SET VersionConfirmedThrough = ?
            WHERE Id IN (?)
        `, [periodTo, ids]);
    }

    async findById(id: number, conn?: mysql.PoolConnection): Promise<BankTransfer | null> {
        const sql = mysql.format(`SELECT * FROM BankTransfers WHERE Id = ? LIMIT 1${conn ? ' FOR UPDATE' : ''}`, [id]);
        const rows = (await ToolsDb.getQueryCallbackAsync(sql, conn)) as any[];
        if (!rows || rows.length === 0) return null;
        return this.mapRow(rows[0]);
    }

    async find(filters: BankTransferFilters = {}): Promise<Array<BankTransfer & { canRestoreToQueue: boolean }>> {
        const conditions: string[] = ['1=1'];
        const params: any[] = [];

        if (filters.searchText) {
            const like = `%${filters.searchText.trim()}%`;
            conditions.push('(CounterpartyName LIKE ? OR CounterpartyAccount LIKE ? OR Title LIKE ? OR Description LIKE ?)');
            params.push(like, like, like, like);
        }
        if (filters.matchingStatus) {
            conditions.push('MatchingStatus = ?');
            params.push(filters.matchingStatus);
        }
        if (filters.direction) {
            conditions.push('Direction = ?');
            params.push(filters.direction);
        }
        if (filters.dateFrom) {
            conditions.push('ExecDate >= ?');
            params.push(filters.dateFrom);
        }
        if (filters.dateTo) {
            conditions.push('ExecDate <= ?');
            params.push(filters.dateTo);
        }

        const sql = mysql.format(
            `SELECT bt.*, EXISTS (
                SELECT 1 FROM PaymentAllocations pa WHERE pa.BankTransferId = bt.Id
             ) AS HasAllocations
             FROM BankTransfers bt WHERE ${conditions.join(' AND ')} ORDER BY ExecDate DESC`,
            params,
        );
        const rows = (await ToolsDb.getQueryCallbackAsync(sql)) as any[];
        return (rows || []).map(row => {
            const transfer = this.mapRow(row);
            return Object.assign(transfer, {
                canRestoreToQueue: transfer.matchingStatus === 'MANUAL' &&
                    supportsInvoiceQueue(transfer) && Number(row.HasAllocations) === 0,
            });
        });
    }

    async findForDuplicateCheck(): Promise<BankTransfer[]> {
        const sql = `SELECT * FROM BankTransfers
            WHERE MatchingStatus <> 'MANUAL' OR JSON_LENGTH(MatchingCandidates) > 0
            ORDER BY Amount DESC, ExecDate ASC`;
        const rows = (await ToolsDb.getQueryCallbackAsync(sql)) as any[];
        return (rows || []).map((r: any) => this.mapRow(r));
    }

    async findWadiumTransfers(): Promise<BankTransfer[]> {
        const sql = mysql.format(
            `SELECT * FROM BankTransfers WHERE Direction = 'IN' AND Description LIKE ? ORDER BY ExecDate DESC`,
            ['%wadium%'],
        );
        const rows = (await ToolsDb.getQueryCallbackAsync(sql)) as any[];
        return (rows || []).map((r: any) => this.mapRow(r));
    }

    async findByStatementIdAndStatus(statementId: number, status: MatchingStatus): Promise<BankTransfer[]> {
        const sql = mysql.format(
            `SELECT * FROM BankTransfers WHERE BankStatementId = ? AND MatchingStatus = ? ORDER BY ExecDate ASC`,
            [statementId, status],
        );
        const rows = (await ToolsDb.getQueryCallbackAsync(sql)) as any[];
        return (rows || []).map((r: any) => this.mapRow(r));
    }

    async findPending(): Promise<Array<BankTransfer & { remainingAmount: number }>> {
        const rows = await ToolsDb.getQueryCallbackAsync(
            `${pendingTransfersSql} ORDER BY bt.ExecDate DESC, bt.Id DESC`,
        ) as mysql.RowDataPacket[];
        return rows.map(row => Object.assign(this.mapRow(row), {
            remainingAmount: Number(row.RemainingAmount),
        }));
    }

    async lockUnallocatedIncoming(conn: mysql.PoolConnection): Promise<BankTransfer[]> {
        const [rows] = await conn.query<mysql.RowDataPacket[]>(`
            SELECT bt.* FROM BankTransfers bt
            WHERE bt.Direction = 'IN' AND bt.MatchingStatus IN ('UNMATCHED','PROPOSED')
              AND bt.ReviewAsPayment = 0 AND bt.ImportNeedsReview = 0
              AND NOT EXISTS (SELECT 1 FROM PaymentAllocations pa WHERE pa.BankTransferId = bt.Id)
            ORDER BY bt.ExecDate, bt.OperationHash
            FOR UPDATE
        `);
        return rows.map((row) => this.mapRow(row));
    }

    async insert(transfer: BankTransfer, conn: mysql.PoolConnection, fileOperationNumber: number): Promise<number> {
        const sql = mysql.format(
            `INSERT INTO BankTransfers
                (${transferInsertColumns.join(', ')})
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
                transfer.bankStatementId,
                transfer.orderDate ?? null,
                transfer.execDate,
                transfer.operationType,
                transfer.direction,
                transfer.amount,
                transfer.currency,
                transfer.counterpartyAccount ?? null,
                transfer.counterpartyName ?? null,
                transfer.counterpartyNip ?? null,
                transfer.title ?? null,
                transfer.description ?? null,
                transfer.operationHash,
                transfer.matchingStatus,
                transfer.matchingScore ?? null,
                transfer.matchingCandidates ? JSON.stringify(transfer.matchingCandidates) : null,
                transfer.reviewAsPayment ? 1 : 0,
                transfer.importNeedsReview ? 1 : 0,
            ],
        );
        try {
            const [result] = await conn.query<mysql.ResultSetHeader>(sql);
            await this.checkWriteWarnings(result, conn, fileOperationNumber);
            return result.insertId;
        } catch (error) {
            // Tylko istniejący odcisk jest do pominięcia. Inny błąd wycofuje cały import.
            if (error instanceof Error && 'code' in error && error.code === 'ER_DUP_ENTRY') return 0;
            throw error;
        }
    }

    private async checkWriteWarnings(result: mysql.ResultSetHeader, conn: mysql.PoolConnection, fileOperationNumber: number): Promise<void> {
        if (!(result.warningStatus > 0)) return;
        try {
            const [warnings] = await conn.query<mysql.RowDataPacket[]>('SHOW WARNINGS');
            for (const warning of warnings) {
                // Message może zawierać wartość pola. Z zapisu DB pobieramy wyłącznie znaną nazwę kolumny.
                const columnName = /\bcolumn ['\x60]([A-Za-z]+)['\x60] at row \d+\s*$/i.exec(warning.Message)?.[1];
                const column = transferInsertColumns.find(name => name.toLowerCase() === columnName?.toLowerCase());
                console.warn('[BankSync] Ostrzeżenie zapisu operacji wyciągu', {
                    code: Number(warning.Code), column: column ?? null, fileOperationNumber,
                });
            }
        } finally {
            throw new BankTransferInsertWarning();
        }
    }

    async updateMatchingStatus(
        id: number,
        status: MatchingStatus,
        score?: number | null,
        candidates?: MatchingCandidate[] | null,
        conn?: mysql.PoolConnection,
        reviewAsPayment = false,
    ): Promise<void> {
        const candidatesJson = candidates ? JSON.stringify(candidates) : null;
        // Once restored as a payment, subsequent status changes keep that classification.
        const sql = mysql.format(
            `UPDATE BankTransfers SET MatchingStatus=?, MatchingScore=?, MatchingCandidates=?,
                ReviewAsPayment=GREATEST(ReviewAsPayment, ?), ImportNeedsReview=0 WHERE Id=?`,
            [status, score ?? null, candidatesJson, reviewAsPayment ? 1 : 0, id],
        );
        if (conn) {
            await conn.query(sql);
        } else {
            await ToolsDb.getQueryCallbackAsync(sql);
        }
    }

    async clearImportReview(id: number, conn: mysql.PoolConnection): Promise<void> {
        await conn.query(
            'UPDATE BankTransfers SET ImportNeedsReview = 0 WHERE Id = ?',
            [id],
        );
    }

    private static dateToStr(val: any): string | null {
        if (!val) return null;
        if (val instanceof Date) {
            const t = val.getTime();
            return isNaN(t) ? null : val.toISOString().slice(0, 10);
        }
        const s = String(val).slice(0, 10);
        return s === '0000-00-00' || s === 'null' || s === '' ? null : s;
    }

    private mapRow(row: any): BankTransfer {
        let candidates: MatchingCandidate[] | null = null;
        if (row.MatchingCandidates) {
            try {
                const data = typeof row.MatchingCandidates === 'string'
                    ? JSON.parse(row.MatchingCandidates)
                    : row.MatchingCandidates;
                if (Array.isArray(data)) candidates = data;
            } catch {
                candidates = null;
            }
        }
        return new BankTransfer({
            id: row.Id,
            bankStatementId: row.BankStatementId,
            orderDate: BankTransferRepository.dateToStr(row.OrderDate),
            execDate: BankTransferRepository.dateToStr(row.ExecDate) ?? 'unknown',
            operationType: row.OperationType,
            direction: row.Direction,
            amount: Number(row.Amount),
            currency: row.Currency,
            counterpartyAccount: row.CounterpartyAccount ?? null,
            counterpartyName: row.CounterpartyName ?? null,
            counterpartyNip: row.CounterpartyNip ?? null,
            title: row.Title ?? null,
            description: row.Description ?? null,
            operationHash: row.OperationHash,
            matchingStatus: row.MatchingStatus,
            matchingScore: row.MatchingScore ?? null,
            matchingCandidates: candidates,
            reviewAsPayment: Number(row.ReviewAsPayment) === 1 || undefined,
            importNeedsReview: Number(row.ImportNeedsReview) === 1 || undefined,
        });
    }
}
