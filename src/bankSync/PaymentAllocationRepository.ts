import ToolsDb from '../tools/ToolsDb';
import mysql from 'mysql2/promise';
import PaymentAllocation from './PaymentAllocation';

export default class PaymentAllocationRepository {
    async findInvoicePayments(invoiceId: number) {
        const rows = await ToolsDb.getQueryCallbackAsync(`
            SELECT pa.Id AS id, pa.BankTransferId AS bankTransferId, pa.AllocatedAmount AS amount,
                DATE_FORMAT(bt.ExecDate, '%Y-%m-%d') AS date, bt.Currency AS currency,
                bt.CounterpartyName AS sender, bt.Title AS title
            FROM PaymentAllocations pa
            JOIN BankTransfers bt ON bt.Id = pa.BankTransferId
            WHERE pa.InvoiceId = ?
            ORDER BY bt.ExecDate, pa.Id
        `, undefined, [invoiceId]) as mysql.RowDataPacket[];
        return rows.map(row => ({
            id: Number(row.id), bankTransferId: Number(row.bankTransferId), amount: Number(row.amount),
            date: row.date as string, currency: row.currency as string,
            sender: row.sender as string | null, title: row.title as string | null,
        }));
    }

    async findByTransferId(transferId: number, conn?: mysql.PoolConnection): Promise<PaymentAllocation[]> {
        const sql = mysql.format(
            `SELECT pa.*, COALESCE(i.Number, ci.InvoiceNumber) AS InvoiceNumber
                FROM PaymentAllocations pa
                LEFT JOIN Invoices i ON i.Id = pa.InvoiceId
                LEFT JOIN CostInvoices ci ON ci.Id = pa.CostInvoiceId
                WHERE pa.BankTransferId = ? ORDER BY pa.Id`,
            [transferId],
        );
        const rows = conn
            ? (await conn.query(sql))[0] as any[]
            : (await ToolsDb.getQueryCallbackAsync(sql)) as any[];
        return (rows || []).map((r: any) => this.mapRow(r));
    }

    async findByInvoiceId(invoiceId: number): Promise<PaymentAllocation[]> {
        const sql = mysql.format(
            'SELECT * FROM PaymentAllocations WHERE InvoiceId = ?',
            [invoiceId],
        );
        const rows = (await ToolsDb.getQueryCallbackAsync(sql)) as any[];
        return (rows || []).map((r: any) => this.mapRow(r));
    }

    async findByCostInvoiceId(costInvoiceId: number): Promise<PaymentAllocation[]> {
        const sql = mysql.format(
            'SELECT * FROM PaymentAllocations WHERE CostInvoiceId = ?',
            [costInvoiceId],
        );
        const rows = (await ToolsDb.getQueryCallbackAsync(sql)) as any[];
        return (rows || []).map((r: any) => this.mapRow(r));
    }

    async findById(id: number): Promise<PaymentAllocation | null> {
        const sql = mysql.format('SELECT * FROM PaymentAllocations WHERE Id = ? LIMIT 1', [id]);
        const rows = (await ToolsDb.getQueryCallbackAsync(sql)) as any[];
        if (!rows || rows.length === 0) return null;
        return this.mapRow(rows[0]);
    }

    async insert(alloc: PaymentAllocation, conn: mysql.PoolConnection): Promise<number> {
        const sql = mysql.format(
            `INSERT INTO PaymentAllocations
                (BankTransferId, InvoiceId, CostInvoiceId, AllocatedAmount, AllocatedPercentage, Source, Confidence, CreatedBy)
             VALUES (?,?,?,?,?,?,?,?)`,
            [
                alloc.bankTransferId,
                alloc.invoiceId ?? null,
                alloc.costInvoiceId ?? null,
                alloc.allocatedAmount,
                alloc.allocatedPercentage,
                alloc.source,
                alloc.confidence ?? null,
                alloc.createdBy ?? null,
            ],
        );
        const [result] = await conn.query(sql);
        return (result as any).insertId;
    }

    async delete(id: number, conn?: mysql.PoolConnection): Promise<void> {
        const sql = mysql.format('DELETE FROM PaymentAllocations WHERE Id = ?', [id]);
        if (conn) {
            await conn.query(sql);
        } else {
            await ToolsDb.getQueryCallbackAsync(sql);
        }
    }

    async getInvoicePayment(invoiceId: number, conn: mysql.PoolConnection): Promise<{
        paidAmount: number;
        paymentDate: string | null;
    }> {
        const [rows] = await conn.query<mysql.RowDataPacket[]>(
            `SELECT COALESCE(SUM(pa.AllocatedAmount), 0) AS PaidAmount,
                    DATE_FORMAT(MAX(bt.ExecDate), '%Y-%m-%d') AS PaymentDate
             FROM PaymentAllocations pa
             JOIN BankTransfers bt ON bt.Id = pa.BankTransferId
             WHERE pa.InvoiceId = ? FOR UPDATE`,
            [invoiceId],
        );
        return { paidAmount: Number(rows[0].PaidAmount), paymentDate: rows[0].PaymentDate };
    }

    async sumAllocatedForTransfer(transferId: number, conn: mysql.PoolConnection): Promise<number> {
        const [rows] = await conn.query<mysql.RowDataPacket[]>(
            'SELECT COALESCE(SUM(AllocatedAmount), 0) AS Total FROM PaymentAllocations WHERE BankTransferId = ? FOR UPDATE',
            [transferId],
        );
        return Number(rows[0].Total);
    }

    async countOverallocatedTransfers(conn: mysql.PoolConnection): Promise<number> {
        const [rows] = await conn.query<mysql.RowDataPacket[]>(`
            SELECT COUNT(*) AS Total FROM (
                SELECT bt.Id FROM BankTransfers bt
                JOIN PaymentAllocations pa ON pa.BankTransferId = bt.Id
                GROUP BY bt.Id, bt.Amount HAVING SUM(pa.AllocatedAmount) > bt.Amount
            ) overallocated
        `);
        return Number(rows[0].Total);
    }

    /** Sum of allocated amounts for a given CostInvoice */
    async sumAllocatedForCostInvoice(costInvoiceId: number, conn?: mysql.PoolConnection): Promise<number> {
        const sql = mysql.format(
            'SELECT COALESCE(SUM(AllocatedAmount), 0) AS Total FROM PaymentAllocations WHERE CostInvoiceId = ?',
            [costInvoiceId],
        );
        const rows = conn
            ? (await conn.query(sql))[0] as any[]
            : (await ToolsDb.getQueryCallbackAsync(sql)) as any[];
        return Number((rows as any)[0]?.Total ?? 0);
    }

    private mapRow(row: any): PaymentAllocation {
        return new PaymentAllocation({
            id: row.Id,
            bankTransferId: row.BankTransferId,
            invoiceId: row.InvoiceId ?? null,
            costInvoiceId: row.CostInvoiceId ?? null,
            allocatedAmount: Number(row.AllocatedAmount),
            allocatedPercentage: Number(row.AllocatedPercentage),
            source: row.Source,
            confidence: row.Confidence ?? null,
            createdBy: row.CreatedBy ?? null,
            createdAt: row.CreatedAt,
            invoiceNumber: row.InvoiceNumber,
        });
    }
}
