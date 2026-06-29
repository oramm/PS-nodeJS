import ToolsDb from '../tools/ToolsDb';
import mysql from 'mysql2/promise';
import BankStatement from './BankStatement';

export default class BankStatementRepository {
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
