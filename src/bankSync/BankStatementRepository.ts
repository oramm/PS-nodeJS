import ToolsDb from '../tools/ToolsDb';
import mysql from 'mysql2/promise';
import BankStatement from './BankStatement';
import { pendingIncomingTransfersSql } from './BankTransferRepository';

export interface BankStatementListItem {
    id: number;
    fileName: string;
    accountNumber: string;
    periodFrom: string;
    periodTo: string;
    importedAt: string;
    importedByName: string | null;
    newOperations: number;
    pendingTransfers: number;
}

export default class BankStatementRepository {
    async find(): Promise<BankStatementListItem[]> {
        const rows = await ToolsDb.getQueryCallbackAsync(`
            SELECT s.Id AS id, s.FileName AS fileName, s.OurAccountNumber AS accountNumber,
                DATE_FORMAT(s.PeriodFrom, '%Y-%m-%d') AS periodFrom,
                DATE_FORMAT(s.PeriodTo, '%Y-%m-%d') AS periodTo,
                DATE_FORMAT(s.ImportedAt, '%Y-%m-%d') AS importedAt,
                NULLIF(TRIM(CONCAT_WS(' ', p.Name, p.Surname)), '') AS importedByName,
                COALESCE(operations.Total, 0) AS newOperations,
                COALESCE(pending.Total, 0) AS pendingTransfers
            FROM BankStatements s
            LEFT JOIN Persons p ON p.Id = s.ImportedBy
            LEFT JOIN (
                SELECT BankStatementId, COUNT(*) AS Total FROM BankTransfers GROUP BY BankStatementId
            ) operations ON operations.BankStatementId = s.Id
            LEFT JOIN (
                SELECT BankStatementId, COUNT(*) AS Total
                FROM (${pendingIncomingTransfersSql}) queue GROUP BY BankStatementId
            ) pending ON pending.BankStatementId = s.Id
            ORDER BY s.PeriodTo DESC, s.PeriodFrom DESC, s.Id DESC
        `) as BankStatementListItem[];
        return rows.map(row => ({
            ...row, newOperations: Number(row.newOperations), pendingTransfers: Number(row.pendingTransfers),
        }));
    }

    async findPeriods(conn: mysql.PoolConnection, accountNumber: string): Promise<Array<Pick<BankStatementListItem, 'periodFrom' | 'periodTo'>>> {
        const [rows] = await conn.query<mysql.RowDataPacket[]>(`
            SELECT DATE_FORMAT(PeriodFrom, '%Y-%m-%d') AS periodFrom,
                DATE_FORMAT(PeriodTo, '%Y-%m-%d') AS periodTo
            FROM BankStatements
            WHERE OurAccountNumber = ?
        `, [accountNumber]);
        return rows.map(row => ({ periodFrom: row.periodFrom, periodTo: row.periodTo }));
    }

    async findByChecksum(checksum: string): Promise<BankStatement | null> {
        const sql = mysql.format(
            'SELECT * FROM BankStatements WHERE RawChecksum = ? LIMIT 1',
            [checksum],
        );
        const rows = (await ToolsDb.getQueryCallbackAsync(sql)) as any[];
        if (!rows || rows.length === 0) return null;
        return this.mapRow(rows[0]);
    }

    async findById(id: number): Promise<BankStatement | null> {
        const sql = mysql.format('SELECT * FROM BankStatements WHERE Id = ? LIMIT 1', [id]);
        const rows = (await ToolsDb.getQueryCallbackAsync(sql)) as any[];
        if (!rows || rows.length === 0) return null;
        return this.mapRow(rows[0]);
    }

    async insert(statement: BankStatement, conn: mysql.PoolConnection): Promise<number> {
        const sql = mysql.format(
            `INSERT INTO BankStatements
                (FileName, OurAccountNumber, PeriodFrom, PeriodTo, ClosingBalance, ImportedBy, RawChecksum)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                statement.fileName,
                statement.ourAccountNumber,
                statement.periodFrom,
                statement.periodTo,
                statement.closingBalance ?? null,
                statement.importedBy ?? null,
                statement.rawChecksum,
            ],
        );
        const [result] = await conn.query(sql);
        return (result as any).insertId;
    }

    private mapRow(row: any): BankStatement {
        return new BankStatement({
            id: row.Id,
            fileName: row.FileName,
            ourAccountNumber: row.OurAccountNumber,
            periodFrom: row.PeriodFrom instanceof Date
                ? row.PeriodFrom.toISOString().slice(0, 10)
                : String(row.PeriodFrom),
            periodTo: row.PeriodTo instanceof Date
                ? row.PeriodTo.toISOString().slice(0, 10)
                : String(row.PeriodTo),
            closingBalance: row.ClosingBalance,
            importedBy: row.ImportedBy,
            importedAt: row.ImportedAt,
            rawChecksum: row.RawChecksum,
        });
    }
}
