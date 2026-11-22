import ToolsDb from '../tools/ToolsDb';
import mysql from 'mysql2/promise';
import BankTransfer, { MatchingCandidate, MatchingStatus, supportsInvoiceQueue } from './BankTransfer';

const reviewAsPaymentSql = "COALESCE(JSON_EXTRACT(MatchingCandidates, '$.reviewAsPayment'), 0) = 1";
const transferInsertColumns = [
    'BankStatementId', 'OrderDate', 'ExecDate', 'OperationType', 'Direction', 'Amount', 'Currency',
    'CounterpartyAccount', 'CounterpartyName', 'CounterpartyNip', 'Title', 'Description',
    'OperationHash', 'MatchingStatus', 'MatchingScore', 'MatchingCandidates',
];

export class BankTransferInsertWarning extends Error {}

export const pendingIncomingTransfersSql = `
    SELECT bt.*, bt.Amount - COALESCE(allocated.Total, 0) AS RemainingAmount
    FROM BankTransfers bt
    LEFT JOIN (
        SELECT BankTransferId, SUM(AllocatedAmount) AS Total
        FROM PaymentAllocations GROUP BY BankTransferId
    ) allocated ON allocated.BankTransferId = bt.Id
    WHERE bt.Direction = 'IN' AND bt.Currency = 'PLN' AND bt.MatchingStatus <> 'MANUAL'
      AND bt.Amount > COALESCE(allocated.Total, 0)
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
            WHERE MatchingStatus <> 'MANUAL' OR MatchingCandidates IS NOT NULL
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
            `${pendingIncomingTransfersSql} ORDER BY bt.ExecDate DESC, bt.Id DESC`,
        ) as mysql.RowDataPacket[];
        return rows.map(row => Object.assign(this.mapRow(row), {
            remainingAmount: Number(row.RemainingAmount),
        }));
    }

    async lockUnallocatedIncoming(conn: mysql.PoolConnection): Promise<BankTransfer[]> {
        const [rows] = await conn.query<mysql.RowDataPacket[]>(`
            SELECT bt.* FROM BankTransfers bt
            WHERE bt.Direction = 'IN' AND bt.MatchingStatus IN ('UNMATCHED','PROPOSED')
              AND NOT (${reviewAsPaymentSql})
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
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
            ],
        );
        try {
            const [result] = await conn.query<mysql.ResultSetHeader>(sql);
            if (result.warningStatus > 0) {
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
            return result.insertId;
        } catch (error) {
            // Tylko istniejący odcisk jest do pominięcia. Inny błąd wycofuje cały import.
            if (error instanceof Error && 'code' in error && error.code === 'ER_DUP_ENTRY') return 0;
            throw error;
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
        // Keep a restored transfer in manual review across assignments and their removal.
        const sql = mysql.format(
            `UPDATE BankTransfers SET MatchingStatus=?, MatchingScore=?, MatchingCandidates=
                CASE WHEN ? OR (${reviewAsPaymentSql})
                    THEN JSON_OBJECT('reviewAsPayment', 1, 'candidates', JSON_EXTRACT(?, '$'))
                    ELSE ?
                END WHERE Id=?`,
            [status, score ?? null, reviewAsPayment, candidatesJson, candidatesJson, id],
        );
        if (conn) {
            await conn.query(sql);
        } else {
            await ToolsDb.getQueryCallbackAsync(sql);
        }
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
        let reviewAsPayment: boolean | undefined;
        if (row.MatchingCandidates) {
            try {
                const data = typeof row.MatchingCandidates === 'string'
                    ? JSON.parse(row.MatchingCandidates)
                    : row.MatchingCandidates;
                if (Array.isArray(data)) candidates = data;
                else if (data?.reviewAsPayment === 1) {
                    reviewAsPayment = true;
                    if (Array.isArray(data.candidates)) candidates = data.candidates;
                }
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
            reviewAsPayment,
        });
    }
}
