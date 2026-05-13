import ToolsDb from '../tools/ToolsDb';
import mysql from 'mysql2/promise';
import PaymentAllocation from './PaymentAllocation';

export default class PaymentAllocationRepository {
    async findByTransferId(transferId: number, conn?: mysql.PoolConnection): Promise<PaymentAllocation[]> {
        const sql = mysql.format(
            'SELECT * FROM PaymentAllocations WHERE BankTransferId = ? ORDER BY Id',
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

    /** Sum of allocated amounts for a given Invoice */
    async sumAllocatedForInvoice(invoiceId: number, conn?: mysql.PoolConnection): Promise<number> {
        const sql = mysql.format(
            'SELECT COALESCE(SUM(AllocatedAmount), 0) AS Total FROM PaymentAllocations WHERE InvoiceId = ?',
            [invoiceId],
        );
        const rows = conn
            ? (await conn.query(sql))[0] as any[]
            : (await ToolsDb.getQueryCallbackAsync(sql)) as any[];
        return Number((rows as any)[0]?.Total ?? 0);
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
        });
    }
}
