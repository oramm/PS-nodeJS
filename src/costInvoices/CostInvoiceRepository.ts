import ToolsDb from '../tools/ToolsDb';
import mysql from 'mysql2';
import CostInvoice, { CostInvoiceItem, CostInvoiceSync, CostCategory } from './CostInvoice';
import { toPaymentStatus } from './CostInvoiceValidator';

/**
 * Repository dla faktur kosztowych
 * 
 * Odpowiada za operacje bazodanowe na fakturach kosztowych.
 */
export default class CostInvoiceRepository {
    
    // =====================================================
    // FAKTURY KOSZTOWE
    // =====================================================

    /**
     * Znajdź fakturę po ID
     */
    async findById(id: number): Promise<CostInvoice | null> {
        const sql = mysql.format(`
            SELECT ci.*, 
                   cc.Name AS CategoryName, cc.Color AS CategoryColor
            FROM CostInvoices ci
            LEFT JOIN CostCategories cc ON ci.CategoryId = cc.Id
            WHERE ci.Id = ?
        `, [id]);
        
        const result = await ToolsDb.getQueryCallbackAsync(sql) as any[];
        if (result.length === 0) return null;
        return this.mapRowToInvoice(result[0]);
    }

    /**
     * Znajdź fakturę po numerze KSeF
     */
    async findByKsefNumber(ksefNumber: string): Promise<CostInvoice | null> {
        const sql = mysql.format(`
            SELECT ci.*, 
                   cc.Name AS CategoryName, cc.Color AS CategoryColor
            FROM CostInvoices ci
            LEFT JOIN CostCategories cc ON ci.CategoryId = cc.Id
            WHERE ci.KsefNumber = ?
        `, [ksefNumber]);
        
        const result = await ToolsDb.getQueryCallbackAsync(sql) as any[];
        if (result.length === 0) return null;
        return this.mapRowToInvoice(result[0]);
    }

    /**
     * Znajdź wszystkie faktury z filtrami
     */
    async findAll(filters?: {
        status?: string;
        dateFrom?: Date;
        dateTo?: Date;
        supplierNip?: string;
        categoryId?: number;
    }): Promise<CostInvoice[]> {
        const conditions: string[] = ['1=1'];
        const params: any[] = [];

        if (filters?.status) {
            conditions.push('ci.Status = ?');
            params.push(filters.status);
        }
        if (filters?.dateFrom) {
            conditions.push('ci.IssueDate >= ?');
            params.push(filters.dateFrom);
        }
        if (filters?.dateTo) {
            conditions.push('ci.IssueDate <= ?');
            params.push(filters.dateTo);
        }
        if (filters?.supplierNip) {
            conditions.push('ci.SupplierNip = ?');
            params.push(filters.supplierNip);
        }
        if (filters?.categoryId) {
            conditions.push('ci.CategoryId = ?');
            params.push(filters.categoryId);
        }

        const sql = mysql.format(`
            SELECT ci.*, 
                   cc.Name AS CategoryName, cc.Color AS CategoryColor
            FROM CostInvoices ci
            LEFT JOIN CostCategories cc ON ci.CategoryId = cc.Id
            WHERE ${conditions.join(' AND ')}
            ORDER BY ci.IssueDate DESC, ci.Id DESC
        `, params);

        const result = await ToolsDb.getQueryCallbackAsync(sql) as any[];
        return result.map((row: any) => this.mapRowToInvoice(row));
    }

    /**
     * Sprawdź które numery KSeF już istnieją w bazie
     */
    async findExistingKsefNumbers(ksefNumbers: string[]): Promise<Set<string>> {
        if (ksefNumbers.length === 0) return new Set();
        
        const sql = mysql.format(
            'SELECT KsefNumber FROM CostInvoices WHERE KsefNumber IN (?)',
            [ksefNumbers]
        );
        
        const result = await ToolsDb.getQueryCallbackAsync(sql) as any[];
        return new Set(result.map((row: any) => row.KsefNumber));
    }

    /**
     * Zapisz nową fakturę
     */
    async create(invoice: CostInvoice): Promise<number> {
        const sql = mysql.format(`
            INSERT INTO CostInvoices (
                KsefNumber, KsefAcquisitionDate, SyncId,
                SupplierNip, SupplierName, SupplierAddress, SupplierBankAccount,
                InvoiceNumber, IssueDate, SaleDate, DueDate,
                NetAmount, VatAmount, GrossAmount, Currency,
                XmlContent, Status, PaymentStatus, PaidAmount,
                BookingPercentage, VatDeductionPercentage,
                CategoryId, Notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            invoice.ksefNumber,
            invoice.ksefAcquisitionDate || null,
            invoice.syncId || null,
            invoice.supplierNip || null,
            invoice.supplierName,
            invoice.supplierAddress || null,
            invoice.supplierBankAccount || null,
            invoice.invoiceNumber,
            invoice.issueDate,
            invoice.saleDate || null,
            invoice.dueDate || null,
            invoice.netAmount,
            invoice.vatAmount,
            invoice.grossAmount,
            invoice.currency,
            invoice.xmlContent || null,
            invoice.status,
            invoice.paymentStatus,
            invoice.paidAmount,
            invoice.bookingPercentage,
            invoice.vatDeductionPercentage,
            invoice.categoryId || null,
            invoice.notes || null,
        ]);

        const result = await ToolsDb.executeSQL(sql);
        return result.insertId;
    }

    /**
     * Aktualizuj fakturę
     */
    async update(invoice: CostInvoice, fields: string[]): Promise<void> {
        if (!invoice.id) throw new Error('Cannot update invoice without ID');

        const setClauses: string[] = [];
        const params: any[] = [];

        const fieldMap: Record<string, any> = {
            status: invoice.status,
            paymentStatus: invoice.paymentStatus,
            paidAmount: invoice.paidAmount,
            bookingPercentage: invoice.bookingPercentage,
            vatDeductionPercentage: invoice.vatDeductionPercentage,
            categoryId: invoice.categoryId,
            bookedBy: invoice.bookedBy,
            bookedAt: invoice.bookedAt,
            notes: invoice.notes,
        };

        for (const field of fields) {
            if (field in fieldMap) {
                const dbField = field.charAt(0).toUpperCase() + field.slice(1);
                setClauses.push(`${dbField} = ?`);
                params.push(fieldMap[field] ?? null);
            }
        }

        setClauses.push('UpdatedAt = NOW()');
        params.push(invoice.id);

        const sql = mysql.format(
            `UPDATE CostInvoices SET ${setClauses.join(', ')} WHERE Id = ?`,
            params
        );
        
        await ToolsDb.executeSQL(sql);
    }

    /**
     * Mapuj wiersz bazy na obiekt
     */
    private mapRowToInvoice(row: any): CostInvoice {
        return new CostInvoice({
            id: row.Id,
            ksefNumber: row.KsefNumber,
            ksefAcquisitionDate: row.KsefAcquisitionDate,
            syncId: row.SyncId,
            supplierNip: row.SupplierNip,
            supplierName: row.SupplierName,
            supplierAddress: row.SupplierAddress,
            supplierBankAccount: row.SupplierBankAccount,
            invoiceNumber: row.InvoiceNumber,
            issueDate: row.IssueDate,
            saleDate: row.SaleDate,
            dueDate: row.DueDate,
            netAmount: row.NetAmount,
            vatAmount: row.VatAmount,
            grossAmount: row.GrossAmount,
            currency: row.Currency,
            xmlContent: row.XmlContent,
            status: row.Status,
            paymentStatus: toPaymentStatus(row.PaymentStatus),
            paidAmount: row.PaidAmount,
            bookingPercentage: row.BookingPercentage,
            vatDeductionPercentage: row.VatDeductionPercentage,
            categoryId: row.CategoryId,
            bookedBy: row.BookedBy,
            bookedAt: row.BookedAt,
            notes: row.Notes,
            createdAt: row.CreatedAt,
            updatedAt: row.UpdatedAt,
            _category: row.CategoryName ? {
                id: row.CategoryId,
                name: row.CategoryName,
                color: row.CategoryColor,
            } : undefined,
        });
    }

    // =====================================================
    // POZYCJE FAKTURY
    // =====================================================

    /**
     * Znajdź pozycje faktury
     */
    async findItemsByInvoiceId(invoiceId: number): Promise<CostInvoiceItem[]> {
        const sql = mysql.format(`
            SELECT cii.*, 
                   cc.Name AS CategoryName, cc.Color AS CategoryColor
            FROM CostInvoiceItems cii
            LEFT JOIN CostCategories cc ON cii.CategoryId = cc.Id
            WHERE cii.CostInvoiceId = ?
            ORDER BY cii.LineNumber
        `, [invoiceId]);
        
        const result = await ToolsDb.getQueryCallbackAsync(sql) as any[];
        return result.map((row: any) => this.mapRowToItem(row));
    }

    /**
     * Zapisz pozycję faktury
     */
    async createItem(item: CostInvoiceItem): Promise<number> {
        const sql = mysql.format(`
            INSERT INTO CostInvoiceItems (
                CostInvoiceId, LineNumber, Description,
                Quantity, Unit, UnitPrice,
                NetValue, VatRate, VatValue, GrossValue,
                IsSelectedForBooking, BookingPercentage, VatDeductionPercentage,
                CategoryId
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            item.costInvoiceId,
            item.lineNumber,
            item.description,
            item.quantity,
            item.unit,
            item.unitPrice,
            item.netValue,
            item.vatRate,
            item.vatValue,
            item.grossValue,
            item.isSelectedForBooking ? 1 : 0,
            item.bookingPercentage,
            item.vatDeductionPercentage,
            item.categoryId || null,
        ]);

        const result = await ToolsDb.executeSQL(sql);
        return result.insertId;
    }

    /**
     * Aktualizuj pozycję faktury
     */
    async updateItem(item: CostInvoiceItem, fields: string[]): Promise<void> {
        if (!item.id) throw new Error('Cannot update item without ID');

        const setClauses: string[] = [];
        const params: any[] = [];

        const fieldMap: Record<string, any> = {
            isSelectedForBooking: item.isSelectedForBooking ? 1 : 0,
            bookingPercentage: item.bookingPercentage,
            vatDeductionPercentage: item.vatDeductionPercentage,
            categoryId: item.categoryId,
        };

        for (const field of fields) {
            if (field in fieldMap) {
                const dbField = field === 'isSelectedForBooking' 
                    ? 'IsSelectedForBooking' 
                    : field.charAt(0).toUpperCase() + field.slice(1);
                setClauses.push(`${dbField} = ?`);
                params.push(fieldMap[field] ?? null);
            }
        }

        if (setClauses.length === 0) return;

        params.push(item.id);
        const sql = mysql.format(
            `UPDATE CostInvoiceItems SET ${setClauses.join(', ')} WHERE Id = ?`,
            params
        );
        
        await ToolsDb.executeSQL(sql);
    }

    private mapRowToItem(row: any): CostInvoiceItem {
        return new CostInvoiceItem({
            id: row.Id,
            costInvoiceId: row.CostInvoiceId,
            lineNumber: row.LineNumber,
            description: row.Description,
            quantity: row.Quantity,
            unit: row.Unit,
            unitPrice: row.UnitPrice,
            netValue: row.NetValue,
            vatRate: row.VatRate,
            vatValue: row.VatValue,
            grossValue: row.GrossValue,
            isSelectedForBooking: !!row.IsSelectedForBooking,
            bookingPercentage: row.BookingPercentage,
            vatDeductionPercentage: row.VatDeductionPercentage,
            categoryId: row.CategoryId,
            _category: row.CategoryName ? {
                id: row.CategoryId,
                name: row.CategoryName,
                color: row.CategoryColor,
            } : undefined,
        });
    }

    // =====================================================
    // SYNCHRONIZACJE
    // =====================================================

    /**
     * Znajdź ostatnią zakończoną synchronizację
     */
    async findLastCompletedSync(): Promise<CostInvoiceSync | null> {
        const sql = `
            SELECT * FROM CostInvoiceSyncs 
            WHERE Status = 'COMPLETED' AND SyncType IN ('INCREMENTAL', 'FULL')
            ORDER BY CompletedAt DESC
            LIMIT 1
        `;
        
        const result = await ToolsDb.getQueryCallbackAsync(sql) as any[];
        if (result.length === 0) return null;
        return this.mapRowToSync(result[0]);
    }

    /**
     * Utwórz rekord synchronizacji
     */
    async createSync(sync: CostInvoiceSync): Promise<number> {
        const sql = mysql.format(`
            INSERT INTO CostInvoiceSyncs (
                StartedAt, DateFrom, DateTo, SyncType, Status, UserId
            ) VALUES (?, ?, ?, ?, ?, ?)
        `, [
            sync.startedAt,
            sync.dateFrom,
            sync.dateTo,
            sync.syncType,
            sync.status,
            sync.userId || null,
        ]);

        const result = await ToolsDb.executeSQL(sql);
        return result.insertId;
    }

    /**
     * Zaktualizuj synchronizację po zakończeniu
     */
    async completeSync(
        syncId: number, 
        status: 'COMPLETED' | 'FAILED',
        imported: number, 
        skipped: number, 
        errors: string[]
    ): Promise<void> {
        const sql = mysql.format(`
            UPDATE CostInvoiceSyncs SET
                CompletedAt = NOW(),
                Status = ?,
                ImportedCount = ?,
                SkippedCount = ?,
                ErrorCount = ?,
                Errors = ?
            WHERE Id = ?
        `, [
            status,
            imported,
            skipped,
            errors.length,
            errors.length > 0 ? JSON.stringify(errors) : null,
            syncId,
        ]);

        await ToolsDb.executeSQL(sql);
    }

    private mapRowToSync(row: any): CostInvoiceSync {
        return new CostInvoiceSync({
            id: row.Id,
            startedAt: row.StartedAt,
            completedAt: row.CompletedAt,
            dateFrom: row.DateFrom,
            dateTo: row.DateTo,
            syncType: row.SyncType,
            importedCount: row.ImportedCount,
            skippedCount: row.SkippedCount,
            errorCount: row.ErrorCount,
            errors: row.Errors ? JSON.parse(row.Errors) : undefined,
            userId: row.UserId,
            status: row.Status,
        });
    }

    // =====================================================
    // KATEGORIE
    // =====================================================

    /**
     * Pobierz wszystkie aktywne kategorie
     */
    async findAllCategories(): Promise<CostCategory[]> {
        const sql = `
            SELECT * FROM CostCategories 
            WHERE IsActive = 1 
            ORDER BY SortOrder, Name
        `;
        
        const result = await ToolsDb.getQueryCallbackAsync(sql) as any[];
        return result.map((row: any) => new CostCategory({
            id: row.Id,
            name: row.Name,
            parentId: row.ParentId,
            color: row.Color,
            vatDeductionDefault: row.VatDeductionDefault,
            isActive: !!row.IsActive,
            sortOrder: row.SortOrder,
        }));
    }
}
