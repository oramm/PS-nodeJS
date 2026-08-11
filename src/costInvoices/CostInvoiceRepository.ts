import ToolsDb from '../tools/ToolsDb';
import mysql from 'mysql2';
import CostInvoice, { CostInvoiceItem, CostInvoiceSync } from './CostInvoice';
import { toPaymentStatus } from './CostInvoiceValidator';
import { buildPaymentMethodFilterSql } from './costInvoicePaymentMethodFilters';
import { toWhiteListStatus, WhiteListStatus } from './whiteList/WhiteListClient';

/**
 * Repository dla faktur kosztowych
 * 
 * Odpowiada za operacje bazodanowe na fakturach kosztowych.
 */
export default class CostInvoiceRepository {
    private optionalColumnsCache: {
        supplierBankAccount: boolean;
        paymentStatus: boolean;
        paidAmount: boolean;
        paymentMethod: boolean;
        invoiceType: boolean;
        paymentDate: boolean;
        whiteListStatus: boolean;
        whiteListRequestId: boolean;
        whiteListCheckedAt: boolean;
    } | null = null;
    
    // =====================================================
    // FAKTURY KOSZTOWE
    // =====================================================

    /**
     * Znajdź fakturę po ID
     */
    async findById(id: number): Promise<CostInvoice | null> {
        const sql = mysql.format(`
            SELECT ci.*
            FROM CostInvoices ci
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
            SELECT ci.*
            FROM CostInvoices ci
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
        searchText?: string;
        dateFrom?: Date;
        dateTo?: Date;
        supplierNip?: string;
        paymentStatus?: string;
        paymentMethod?: string;
    }): Promise<CostInvoice[]> {
        const conditions: string[] = ['1=1'];
        const params: any[] = [];

        if (filters?.searchText) {
            const searchText = `%${String(filters.searchText).trim()}%`;
            conditions.push(`(
                ci.InvoiceNumber LIKE ? OR
                ci.SupplierName LIKE ? OR
                ci.SupplierNip LIKE ? OR
                ci.KsefNumber LIKE ?
            )`);
            params.push(searchText, searchText, searchText, searchText);
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
        if (filters?.paymentStatus || filters?.paymentMethod) {
            const optionalColumns = await this.getOptionalColumnsAvailability();
            if (filters.paymentStatus) {
                if (!optionalColumns.paymentStatus) {
                    throw new Error(
                        'Filtrowanie po statusie płatności wymaga kolumny PaymentStatus w tabeli CostInvoices.',
                    );
                }
                conditions.push('ci.PaymentStatus = ?');
                params.push(filters.paymentStatus);
            }
            if (filters.paymentMethod) {
                if (!optionalColumns.paymentMethod) {
                    throw new Error(
                        'Filtrowanie po formie płatności wymaga kolumny PaymentMethod w tabeli CostInvoices.',
                    );
                }
                const paymentMethodFilter = buildPaymentMethodFilterSql(filters.paymentMethod);
                conditions.push(paymentMethodFilter.condition);
                params.push(...paymentMethodFilter.params);
            }
        }

        const sql = mysql.format(`
            SELECT ci.*
            FROM CostInvoices ci
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
        const optionalColumns = await this.getOptionalColumnsAvailability();

        const fields = [
            'KsefNumber',
            'KsefAcquisitionDate',
            'SyncId',
            'SupplierNip',
            'SupplierName',
            'SupplierAddress',
            ...(optionalColumns.supplierBankAccount
                ? ['SupplierBankAccount']
                : []),
            ...(optionalColumns.whiteListStatus ? ['WhiteListStatus'] : []),
            ...(optionalColumns.whiteListRequestId ? ['WhiteListRequestId'] : []),
            ...(optionalColumns.whiteListCheckedAt ? ['WhiteListCheckedAt'] : []),
            'InvoiceNumber',
            'IssueDate',
            'SaleDate',
            'DueDate',
            ...(optionalColumns.paymentMethod ? ['PaymentMethod'] : []),
            ...(optionalColumns.invoiceType ? ['InvoiceType'] : []),
            ...(optionalColumns.paymentDate ? ['PaymentDate'] : []),
            'NetAmount',
            'VatAmount',
            'GrossAmount',
            'Currency',
            'XmlContent',
            ...(optionalColumns.paymentStatus ? ['PaymentStatus'] : []),
            ...(optionalColumns.paidAmount ? ['PaidAmount'] : []),
            'Notes',
        ];

        const values = [
            invoice.ksefNumber,
            invoice.ksefAcquisitionDate || null,
            invoice.syncId || null,
            invoice.supplierNip || null,
            invoice.supplierName,
            invoice.supplierAddress || null,
            ...(optionalColumns.supplierBankAccount
                ? [invoice.supplierBankAccount || null]
                : []),
            ...(optionalColumns.whiteListStatus ? [invoice.whiteListStatus] : []),
            ...(optionalColumns.whiteListRequestId ? [invoice.whiteListRequestId || null] : []),
            ...(optionalColumns.whiteListCheckedAt ? [invoice.whiteListCheckedAt || null] : []),
            invoice.invoiceNumber,
            invoice.issueDate,
            invoice.saleDate || null,
            invoice.dueDate || null,
            ...(optionalColumns.paymentMethod ? [invoice.paymentMethod || null] : []),
            ...(optionalColumns.invoiceType ? [invoice.invoiceType || null] : []),
            ...(optionalColumns.paymentDate ? [invoice.paymentDate || null] : []),
            invoice.netAmount,
            invoice.vatAmount,
            invoice.grossAmount,
            invoice.currency,
            invoice.xmlContent || null,
            ...(optionalColumns.paymentStatus ? [invoice.paymentStatus] : []),
            ...(optionalColumns.paidAmount ? [invoice.paidAmount] : []),
            invoice.notes || null,
        ];

        const placeholders = new Array(fields.length).fill('?').join(', ');
        const sql = mysql.format(
            `INSERT INTO CostInvoices (${fields.join(', ')}) VALUES (${placeholders})`,
            values,
        );

        const result = await ToolsDb.executeSQL(sql);
        return result.insertId;
    }

    private async getOptionalColumnsAvailability(): Promise<{
        supplierBankAccount: boolean;
        paymentStatus: boolean;
        paidAmount: boolean;
        paymentMethod: boolean;
        invoiceType: boolean;
        paymentDate: boolean;
        whiteListStatus: boolean;
        whiteListRequestId: boolean;
        whiteListCheckedAt: boolean;
    }> {
        if (this.optionalColumnsCache) {
            return this.optionalColumnsCache;
        }

        const sql = mysql.format(
            `
                SELECT COLUMN_NAME
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE()
                    AND TABLE_NAME = 'CostInvoices'
                    AND COLUMN_NAME IN ('SupplierBankAccount', 'PaymentStatus', 'PaidAmount', 'PaymentMethod', 'InvoiceType', 'PaymentDate', 'WhiteListStatus', 'WhiteListRequestId', 'WhiteListCheckedAt')
            `,
            [],
        );

        const result = (await ToolsDb.getQueryCallbackAsync(sql)) as any[];
        const columnNames = new Set(
            result.map((row: any) => String(row.COLUMN_NAME || '')),
        );

        this.optionalColumnsCache = {
            supplierBankAccount: columnNames.has('SupplierBankAccount'),
            paymentStatus: columnNames.has('PaymentStatus'),
            paidAmount: columnNames.has('PaidAmount'),
            paymentMethod: columnNames.has('PaymentMethod'),
            invoiceType: columnNames.has('InvoiceType'),
            paymentDate: columnNames.has('PaymentDate'),
            whiteListStatus: columnNames.has('WhiteListStatus'),
            whiteListRequestId: columnNames.has('WhiteListRequestId'),
            whiteListCheckedAt: columnNames.has('WhiteListCheckedAt'),
        };

        return this.optionalColumnsCache;
    }

    /**
     * Nadpisz wynik weryfikacji Bialej Listy VAT (tylko ostatni wynik — bez historii).
     * Uzywane zarowno przez hook importu KSeF, jak i endpoint recznej (re-)weryfikacji.
     * Zwraca `true` gdy cokolwiek utrwalono; `false` gdy kolumny WL sa niedostepne
     * (brak migracji 004 / przestarzaly cache) — wtedy nic nie zapisano.
     */
    async updateWhiteList(
        id: number,
        data: { whiteListStatus: WhiteListStatus; whiteListRequestId?: string; whiteListCheckedAt?: Date },
    ): Promise<boolean> {
        const optionalColumns = await this.getOptionalColumnsAvailability();

        const setClauses: string[] = [];
        const params: any[] = [];

        if (optionalColumns.whiteListStatus) {
            setClauses.push('WhiteListStatus = ?');
            params.push(data.whiteListStatus);
        }
        if (optionalColumns.whiteListRequestId) {
            setClauses.push('WhiteListRequestId = ?');
            params.push(data.whiteListRequestId ?? null);
        }
        if (optionalColumns.whiteListCheckedAt) {
            setClauses.push('WhiteListCheckedAt = ?');
            params.push(data.whiteListCheckedAt ?? null);
        }

        if (setClauses.length === 0) return false;

        setClauses.push('UpdatedAt = NOW()');
        params.push(id);

        const sql = mysql.format(
            `UPDATE CostInvoices SET ${setClauses.join(', ')} WHERE Id = ?`,
            params,
        );
        await ToolsDb.executeSQL(sql);
        return true;
    }

    async updatePayment(
        id: number,
        data: { paymentStatus: string; paidAmount: number; paymentDate?: string | null },
        conn?: import('mysql2/promise').PoolConnection,
    ): Promise<void> {
        const sql = mysql.format(
            `UPDATE CostInvoices SET PaymentStatus=?, PaidAmount=?, UpdatedAt=NOW() WHERE Id=?`,
            [data.paymentStatus, data.paidAmount, id],
        );
        if (conn) {
            await conn.query(sql);
        } else {
            await ToolsDb.executeSQL(sql);
        }
    }

    /**
     * Aktualizuj fakturę
     */
    async update(invoice: CostInvoice, fields: string[]): Promise<void> {
        if (!invoice.id) throw new Error('Cannot update invoice without ID');

        const setClauses: string[] = [];
        const params: any[] = [];

        const fieldMap: Record<string, any> = {
            paymentStatus: invoice.paymentStatus,
            paidAmount: invoice.paidAmount,
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
     * Zaktualizuj pola wyprowadzane z XML (używane przez reparse).
     * Nie resetuje ręcznie edytowanych pól (notatki).
     */
    async updateParsedFields(
        id: number,
        data: {
            paymentStatus: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' | 'NOT_APPLICABLE';
            paidAmount: number;
            paymentDate?: Date;
            paymentMethod?: string;
            invoiceType?: string;
        },
    ): Promise<void> {
        const optionalColumns = await this.getOptionalColumnsAvailability();

        const setClauses: string[] = [];
        const params: any[] = [];

        if (optionalColumns.paymentStatus) {
            setClauses.push('PaymentStatus = ?');
            params.push(data.paymentStatus);
        }
        if (optionalColumns.paidAmount) {
            setClauses.push('PaidAmount = ?');
            params.push(data.paidAmount);
        }
        if (optionalColumns.paymentMethod) {
            setClauses.push('PaymentMethod = ?');
            params.push(data.paymentMethod ?? null);
        }
        if (optionalColumns.invoiceType) {
            setClauses.push('InvoiceType = ?');
            params.push(data.invoiceType ?? null);
        }
        if (optionalColumns.paymentDate) {
            setClauses.push('PaymentDate = ?');
            params.push(data.paymentDate ?? null);
        }

        if (setClauses.length === 0) return;

        setClauses.push('UpdatedAt = NOW()');
        params.push(id);

        const sql = mysql.format(
            `UPDATE CostInvoices SET ${setClauses.join(', ')} WHERE Id = ?`,
            params,
        );
        await ToolsDb.executeSQL(sql);
    }

    /**
     * Zaktualizuj cały nagłówek faktury na podstawie reparse XML (bez pozycji).
     */
    async updateReparsedHeader(invoice: CostInvoice): Promise<void> {
        if (!invoice.id) throw new Error('Cannot update invoice without ID');

        const optionalColumns = await this.getOptionalColumnsAvailability();

        const setClauses: string[] = [
            'SupplierNip = ?',
            'SupplierName = ?',
            'SupplierAddress = ?',
            'InvoiceNumber = ?',
            'IssueDate = ?',
            'SaleDate = ?',
            'DueDate = ?',
            'NetAmount = ?',
            'VatAmount = ?',
            'GrossAmount = ?',
            'Currency = ?',
        ];

        const params: any[] = [
            invoice.supplierNip || null,
            invoice.supplierName,
            invoice.supplierAddress || null,
            invoice.invoiceNumber,
            invoice.issueDate,
            invoice.saleDate || null,
            invoice.dueDate || null,
            invoice.netAmount,
            invoice.vatAmount,
            invoice.grossAmount,
            invoice.currency,
        ];

        if (optionalColumns.supplierBankAccount) {
            setClauses.push('SupplierBankAccount = ?');
            params.push(invoice.supplierBankAccount || null);
        }
        if (optionalColumns.paymentStatus) {
            setClauses.push('PaymentStatus = ?');
            params.push(invoice.paymentStatus);
        }
        if (optionalColumns.paidAmount) {
            setClauses.push('PaidAmount = ?');
            params.push(invoice.paidAmount);
        }
        if (optionalColumns.paymentMethod) {
            setClauses.push('PaymentMethod = ?');
            params.push(invoice.paymentMethod || null);
        }
        if (optionalColumns.invoiceType) {
            setClauses.push('InvoiceType = ?');
            params.push(invoice.invoiceType || null);
        }
        if (optionalColumns.paymentDate) {
            setClauses.push('PaymentDate = ?');
            params.push(invoice.paymentDate || null);
        }

        setClauses.push('UpdatedAt = NOW()');
        params.push(invoice.id);

        const sql = mysql.format(
            `UPDATE CostInvoices SET ${setClauses.join(', ')} WHERE Id = ?`,
            params,
        );
        await ToolsDb.executeSQL(sql);
    }

    /**
     * Zaktualizuj wartości finansowe pozycji faktury (bez booking settings).
     * Dopasowanie po LineNumber — pozycje bez odpowiednika są pomijane.
     */
    async updateItemFinancials(invoiceId: number, newItems: CostInvoiceItem[]): Promise<void> {
        const existing = await this.findItemsByInvoiceId(invoiceId);

        for (const newItem of newItems) {
            const match = existing.find((item) => item.lineNumber === newItem.lineNumber);
            if (!match?.id) continue;

            const sql = mysql.format(
                `UPDATE CostInvoiceItems
                 SET Description = ?, Quantity = ?, Unit = ?,
                     UnitPrice = ?, NetValue = ?, VatRate = ?,
                     VatValue = ?, GrossValue = ?
                 WHERE Id = ?`,
                [
                    newItem.description,
                    newItem.quantity,
                    newItem.unit,
                    newItem.unitPrice,
                    newItem.netValue,
                    newItem.vatRate,
                    newItem.vatValue,
                    newItem.grossValue,
                    match.id,
                ],
            );

            await ToolsDb.executeSQL(sql);
        }
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
            whiteListStatus: toWhiteListStatus(row.WhiteListStatus),
            whiteListRequestId: row.WhiteListRequestId ?? undefined,
            whiteListCheckedAt: row.WhiteListCheckedAt ?? undefined,
            invoiceNumber: row.InvoiceNumber,
            issueDate: row.IssueDate,
            saleDate: row.SaleDate,
            dueDate: row.DueDate,
            paymentMethod: row.PaymentMethod ?? undefined,
            invoiceType: row.InvoiceType ?? undefined,
            paymentDate: row.PaymentDate ?? undefined,
            netAmount: row.NetAmount,
            vatAmount: row.VatAmount,
            grossAmount: row.GrossAmount,
            currency: row.Currency,
            xmlContent: row.XmlContent,
            paymentStatus: toPaymentStatus(row.PaymentStatus),
            paidAmount: row.PaidAmount,
            notes: row.Notes,
            createdAt: row.CreatedAt,
            updatedAt: row.UpdatedAt,
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
            SELECT cii.*
            FROM CostInvoiceItems cii
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
                NetValue, VatRate, VatValue, GrossValue
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        ]);

        const result = await ToolsDb.executeSQL(sql);
        return result.insertId;
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
}
