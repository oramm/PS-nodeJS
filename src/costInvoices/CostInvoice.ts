import ToolsDate from '../tools/ToolsDate';
import { WhiteListStatus } from './whiteList/WhiteListClient';

/**
 * Model faktury kosztowej (zakupowej) z KSeF
 * 
 * Reprezentuje fakturę otrzymaną od dostawcy, pobraną z KSeF
 * do rozliczenia jako koszt.
 */
export default class CostInvoice {
    id?: number;
    
    // Identyfikacja KSeF
    ksefNumber: string;
    ksefAcquisitionDate?: Date;
    
    // Synchronizacja
    syncId?: number;
    
    // Dane dostawcy
    supplierNip?: string;
    supplierName: string;
    supplierAddress?: string;
    supplierBankAccount?: string;

    // Weryfikacja Bialej Listy VAT (KAS wl-api) — ponytail: tylko ostatni wynik
    whiteListStatus: WhiteListStatus;
    whiteListRequestId?: string;
    whiteListCheckedAt?: Date;

    // Dane faktury
    invoiceNumber: string;
    invoiceType?: string;
    issueDate: Date;
    saleDate?: Date;
    dueDate?: Date;
    paymentMethod?: string;
    paymentDate?: Date;
    
    // Kwoty
    netAmount: number;
    vatAmount: number;
    grossAmount: number;
    currency: string;
    
    // Oryginalny XML
    xmlContent?: string;

    // Status płatności
    paymentStatus: PaymentStatus;
    paidAmount: number;

    // Notatka własna do faktury
    notes?: string;

    // Timestamps
    createdAt?: Date;
    updatedAt?: Date;

    // Relacje (ładowane osobno)
    _items?: CostInvoiceItem[];

    constructor(data: Partial<CostInvoice>) {
        const parseDecimal = (value: unknown, fallback = 0): number => {
            if (value === null || value === undefined || value === '') return fallback;
            const normalized = String(value).replace(',', '.');
            const parsed = Number.parseFloat(normalized);
            return Number.isNaN(parsed) ? fallback : parsed;
        };

        this.id = data.id;
        this.ksefNumber = data.ksefNumber || '';
        this.ksefAcquisitionDate = data.ksefAcquisitionDate;
        this.syncId = data.syncId;
        
        this.supplierNip = data.supplierNip;
        this.supplierName = data.supplierName || '';
        this.supplierAddress = data.supplierAddress;
        this.supplierBankAccount = data.supplierBankAccount;

        this.whiteListStatus = data.whiteListStatus || 'NOT_CHECKED';
        this.whiteListRequestId = data.whiteListRequestId;
        this.whiteListCheckedAt = data.whiteListCheckedAt ? new Date(data.whiteListCheckedAt) : undefined;

        this.invoiceNumber = data.invoiceNumber || '';
        this.invoiceType = data.invoiceType;
        this.issueDate = data.issueDate ? new Date(data.issueDate) : new Date();
        this.saleDate = data.saleDate ? new Date(data.saleDate) : undefined;
        this.dueDate = data.dueDate ? new Date(data.dueDate) : undefined;
        this.paymentMethod = data.paymentMethod;
        this.paymentDate = data.paymentDate ? new Date(data.paymentDate) : undefined;
        
        this.netAmount = parseDecimal(data.netAmount, 0);
        this.vatAmount = parseDecimal(data.vatAmount, 0);
        this.grossAmount = parseDecimal(data.grossAmount, 0);
        this.currency = data.currency || 'PLN';
        
        this.xmlContent = data.xmlContent;
        
        this.paymentStatus = data.paymentStatus || 'UNPAID';
        this.paidAmount = parseDecimal(data.paidAmount, 0);

        this.notes = data.notes;

        this.createdAt = data.createdAt;
        this.updatedAt = data.updatedAt;

        this._items = data._items;
    }

    /**
     * Formatuje datę wystawienia
     */
    get issueDateFormatted(): string {
        return ToolsDate.dateJsToSql(this.issueDate) || '';
    }

    /**
     * Serializuje do JSON (dla API response)
     */
    toJson(): Record<string, any> {
        const formatDate = (value?: Date): string | undefined => {
            if (!value) return undefined;
            return ToolsDate.dateJsToSql(value);
        };

        return {
            id: this.id,
            ksefNumber: this.ksefNumber,
            ksefAcquisitionDate: formatDate(this.ksefAcquisitionDate),
            supplierNip: this.supplierNip,
            supplierName: this.supplierName,
            supplierAddress: this.supplierAddress,
            supplierBankAccount: this.supplierBankAccount,
            whiteListStatus: this.whiteListStatus,
            whiteListRequestId: this.whiteListRequestId,
            whiteListCheckedAt: formatDate(this.whiteListCheckedAt),
            invoiceNumber: this.invoiceNumber,
            invoiceType: this.invoiceType,
            issueDate: formatDate(this.issueDate),
            saleDate: formatDate(this.saleDate),
            dueDate: formatDate(this.dueDate),
            paymentMethod: this.paymentMethod,
            paymentDate: formatDate(this.paymentDate),
            netAmount: this.netAmount,
            vatAmount: this.vatAmount,
            grossAmount: this.grossAmount,
            currency: this.currency,
            paymentStatus: this.paymentStatus,
            paidAmount: this.paidAmount,
            notes: this.notes,
            createdAt: formatDate(this.createdAt),
            updatedAt: formatDate(this.updatedAt),
            _items: this._items?.map(item => ({
                id: item.id,
                lineNumber: item.lineNumber,
                description: item.description,
                quantity: item.quantity,
                unit: item.unit,
                unitPrice: item.unitPrice,
                netValue: item.netValue,
                vatRate: item.vatRate,
                vatValue: item.vatValue,
                grossValue: item.grossValue,
            })),
        };
    }
}

/**
 * Status płatności faktury kosztowej
 * UNPAID - niezapłacona
 * PARTIALLY_PAID - częściowo zapłacona
 * PAID - zapłacona
 * NOT_APPLICABLE - status płatności nie ma zastosowania (np. korekta in minus bez danych płatności)
 */
export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'NOT_APPLICABLE';

/**
 * Model pozycji faktury kosztowej
 */
export class CostInvoiceItem {
    id?: number;
    costInvoiceId: number;
    
    // Pozycja
    lineNumber: number;
    description: string;
    
    // Ilość i cena
    quantity: number;
    unit: string;
    unitPrice: number;
    
    // Wartości
    netValue: number;
    vatRate: number;
    vatValue: number;
    grossValue: number;

    constructor(data: Partial<CostInvoiceItem>) {
        this.id = data.id;
        this.costInvoiceId = data.costInvoiceId || 0;
        
        this.lineNumber = data.lineNumber || 1;
        this.description = data.description || '';
        
        this.quantity = data.quantity || 1;
        this.unit = data.unit || 'szt.';
        this.unitPrice = data.unitPrice || 0;
        
        this.netValue = data.netValue || 0;
        this.vatRate = data.vatRate ?? 23;
        this.vatValue = data.vatValue || 0;
        this.grossValue = data.grossValue || 0;
    }
}

/**
 * Model synchronizacji
 */
export class CostInvoiceSync {
    id?: number;
    startedAt: Date;
    completedAt?: Date;
    dateFrom: Date;
    dateTo: Date;
    syncType: 'INCREMENTAL' | 'FULL' | 'VERIFICATION';
    importedCount: number;
    skippedCount: number;
    errorCount: number;
    errors?: string[];
    userId?: number;
    status: 'IN_PROGRESS' | 'RUNNING' | 'COMPLETED' | 'FAILED';

    constructor(data: Partial<CostInvoiceSync>) {
        this.id = data.id;
        this.startedAt = data.startedAt || new Date();
        this.completedAt = data.completedAt;
        this.dateFrom = data.dateFrom || new Date();
        this.dateTo = data.dateTo || new Date();
        this.syncType = data.syncType || 'INCREMENTAL';
        this.importedCount = data.importedCount || 0;
        this.skippedCount = data.skippedCount || 0;
        this.errorCount = data.errorCount || 0;
        this.errors = data.errors;
        this.userId = data.userId;
        this.status = data.status || 'RUNNING';
    }
}
