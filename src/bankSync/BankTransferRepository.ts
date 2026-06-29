import ToolsDb from '../tools/ToolsDb';
import mysql from 'mysql2/promise';
import BankTransfer, { MatchingCandidate, MatchingStatus } from './BankTransfer';

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

    async findById(id: number): Promise<BankTransfer | null> {
        const sql = mysql.format('SELECT * FROM BankTransfers WHERE Id = ? LIMIT 1', [id]);
        const rows = (await ToolsDb.getQueryCallbackAsync(sql)) as any[];
        if (!rows || rows.length === 0) return null;
        return this.mapRow(rows[0]);
    }

    async find(filters: BankTransferFilters = {}): Promise<BankTransfer[]> {
        const conditions: string[] = ['1=1'];
        const params: any[] = [];

        if (filters.searchText) {
            const like = `%${filters.searchText.trim()}%`;
            conditions.push('(CounterpartyName LIKE ? OR CounterpartyAccount LIKE ? OR Description LIKE ?)');
            params.push(like, like, like);
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
            `SELECT * FROM BankTransfers WHERE ${conditions.join(' AND ')} ORDER BY ExecDate DESC`,
            params,
        );
        const rows = (await ToolsDb.getQueryCallbackAsync(sql)) as any[];
        return (rows || []).map((r: any) => this.mapRow(r));
    }

    async findForDuplicateCheck(): Promise<BankTransfer[]> {
        const sql = `SELECT * FROM BankTransfers WHERE MatchingStatus <> 'MANUAL' ORDER BY Amount DESC, ExecDate ASC`;
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

    async findPending(): Promise<BankTransfer[]> {
        const sql = `SELECT * FROM BankTransfers WHERE MatchingStatus IN ('UNMATCHED','PROPOSED') ORDER BY ExecDate DESC`;
        const rows = (await ToolsDb.getQueryCallbackAsync(sql)) as any[];
        return (rows || []).map((r: any) => this.mapRow(r));
    }

    async insert(transfer: BankTransfer, conn: mysql.PoolConnection): Promise<number> {
        const sql = mysql.format(
            `INSERT IGNORE INTO BankTransfers
                (BankStatementId, OrderDate, ExecDate, OperationType, Direction, Amount, Currency,
                 CounterpartyAccount, CounterpartyName, CounterpartyNip, Title, Description,
                 OperationHash, MatchingStatus, MatchingScore, MatchingCandidates)
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
        const [result] = await conn.query(sql);
        return (result as any).insertId;
    }

    async updateMatchingStatus(
        id: number,
        status: MatchingStatus,
        score?: number | null,
        candidates?: MatchingCandidate[] | null,
        conn?: mysql.PoolConnection,
    ): Promise<void> {
        const sql = mysql.format(
            `UPDATE BankTransfers SET MatchingStatus=?, MatchingScore=?, MatchingCandidates=? WHERE Id=?`,
            [status, score ?? null, candidates ? JSON.stringify(candidates) : null, id],
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
        if (row.MatchingCandidates) {
            try {
                candidates = typeof row.MatchingCandidates === 'string'
                    ? JSON.parse(row.MatchingCandidates)
                    : row.MatchingCandidates;
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
        });
    }
}
