import ToolsDate from '../tools/ToolsDate';

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
    
    // Dane faktury
    invoiceNumber: string;
    issueDate: Date;
    saleDate?: Date;
    dueDate?: Date;
    
    // Kwoty
    netAmount: number;
    vatAmount: number;
    grossAmount: number;
    currency: string;
    
    // Oryginalny XML
    xmlContent?: string;
    
    // Status księgowania
    status: CostInvoiceStatus;

    // Status płatności
    paymentStatus: PaymentStatus;
    paidAmount: number;
    
    // Ustawienia księgowania
    bookingPercentage: number;
    vatDeductionPercentage: number;
    
    // Przypisania
    categoryId?: number;
    
    // Audyt
    bookedBy?: number;
    bookedAt?: Date;
    notes?: string;
    
    // Timestamps
    createdAt?: Date;
    updatedAt?: Date;
    
    // Relacje (ładowane osobno)
    _items?: CostInvoiceItem[];
    _category?: { id: number; name: string; color?: string };

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
        
        this.invoiceNumber = data.invoiceNumber || '';
        this.issueDate = data.issueDate ? new Date(data.issueDate) : new Date();
        this.saleDate = data.saleDate ? new Date(data.saleDate) : undefined;
        this.dueDate = data.dueDate ? new Date(data.dueDate) : undefined;
        
        this.netAmount = parseDecimal(data.netAmount, 0);
        this.vatAmount = parseDecimal(data.vatAmount, 0);
        this.grossAmount = parseDecimal(data.grossAmount, 0);
        this.currency = data.currency || 'PLN';
        
        this.xmlContent = data.xmlContent;
        
        this.status = data.status || 'NEW';
        this.paymentStatus = data.paymentStatus || 'UNPAID';
        this.paidAmount = parseDecimal(data.paidAmount, 0);
        this.bookingPercentage = parseDecimal(data.bookingPercentage, 100);
        this.vatDeductionPercentage = parseDecimal(data.vatDeductionPercentage, 100);
        
        this.categoryId = data.categoryId;
        
        this.bookedBy = data.bookedBy;
        this.bookedAt = data.bookedAt;
        this.notes = data.notes;
        
        this.createdAt = data.createdAt;
        this.updatedAt = data.updatedAt;
        
        this._items = data._items;
        this._category = data._category;
    }

    /**
     * Oblicza wartość netto do zaksięgowania
     */
    get bookableNetAmount(): number {
        return this.netAmount * (this.bookingPercentage / 100);
    }

    /**
     * Oblicza wartość VAT do odliczenia
     */
    get deductibleVatAmount(): number {
        return this.vatAmount * (this.vatDeductionPercentage / 100);
    }

    /**
     * Formatuje datę wystawienia
     */
    get issueDateFormatted(): string {
        return ToolsDate.dateJsToSql(this.issueDate) || '';
    }

    /**
     * Sprawdza czy faktura jest zaksięgowana
     */
    get isBooked(): boolean {
        return this.status === 'BOOKED';
    }

    /**
     * Sprawdza czy można edytować ustawienia księgowania
     */
    get isEditable(): boolean {
        return this.status !== 'BOOKED';
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
            invoiceNumber: this.invoiceNumber,
            issueDate: formatDate(this.issueDate),
            saleDate: formatDate(this.saleDate),
            dueDate: formatDate(this.dueDate),
            netAmount: this.netAmount,
            vatAmount: this.vatAmount,
            grossAmount: this.grossAmount,
            currency: this.currency,
            status: this.status,
            paymentStatus: this.paymentStatus,
            paidAmount: this.paidAmount,
            bookingPercentage: this.bookingPercentage,
            vatDeductionPercentage: this.vatDeductionPercentage,
            bookableNetAmount: this.bookableNetAmount,
            deductibleVatAmount: this.deductibleVatAmount,
            categoryId: this.categoryId,
            bookedBy: this.bookedBy,
            bookedAt: formatDate(this.bookedAt),
            notes: this.notes,
            createdAt: formatDate(this.createdAt),
            updatedAt: formatDate(this.updatedAt),
            isEditable: this.isEditable,
            isBooked: this.isBooked,
            _category: this._category,
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
                isSelectedForBooking: item.isSelectedForBooking,
                bookingPercentage: item.bookingPercentage,
                vatDeductionPercentage: item.vatDeductionPercentage,
                bookableNetValue: item.bookableNetValue,
                deductibleVatValue: item.deductibleVatValue,
                categoryId: item.categoryId,
                _category: item._category,
            })),
        };
    }
}

/**
 * Status faktury kosztowej
 * NEW - nowa, do przejrzenia
 * BOOKED - zaksięgowana
 * EXCLUDED - wykluczona
 */
export type CostInvoiceStatus = 'NEW' | 'EXCLUDED' | 'BOOKED';

/**
 * Status płatności faktury kosztowej
 * UNPAID - niezapłacona
 * PARTIALLY_PAID - częściowo zapłacona
 * PAID - zapłacona
 */
export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

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
    
    // Księgowanie
    isSelectedForBooking: boolean;
    bookingPercentage: number;
    vatDeductionPercentage: number;
    
    // Przypisania
    categoryId?: number;
    
    _category?: { id: number; name: string; color?: string };

    constructor(data: Partial<CostInvoiceItem>) {
        this.id = data.id;
        this.costInvoiceId = data.costInvoiceId || 0;
        
        this.lineNumber = data.lineNumber || 1;
        this.description = data.description || '';
        
        this.quantity = data.quantity || 1;
        this.unit = data.unit || 'szt.';
        this.unitPrice = data.unitPrice || 0;
        
        this.netValue = data.netValue || 0;
        this.vatRate = data.vatRate || 23;
        this.vatValue = data.vatValue || 0;
        this.grossValue = data.grossValue || 0;
        
        this.isSelectedForBooking = data.isSelectedForBooking ?? true;
        this.bookingPercentage = data.bookingPercentage ?? 100;
        this.vatDeductionPercentage = data.vatDeductionPercentage ?? 100;
        
        this.categoryId = data.categoryId;
        this._category = data._category;
    }

    /**
     * Oblicza wartość netto do zaksięgowania
     */
    get bookableNetValue(): number {
        if (!this.isSelectedForBooking) return 0;
        return this.netValue * (this.bookingPercentage / 100);
    }

    /**
     * Oblicza wartość VAT do odliczenia
     */
    get deductibleVatValue(): number {
        if (!this.isSelectedForBooking) return 0;
        return this.vatValue * (this.vatDeductionPercentage / 100);
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

/**
 * Model kategorii kosztów
 */
export class CostCategory {
    id?: number;
    name: string;
    parentId?: number;
    color?: string;
    vatDeductionDefault: number;
    isActive: boolean;
    sortOrder: number;

    constructor(data: Partial<CostCategory>) {
        this.id = data.id;
        this.name = data.name || '';
        this.parentId = data.parentId;
        this.color = data.color;
        this.vatDeductionDefault = data.vatDeductionDefault ?? 100;
        this.isActive = data.isActive ?? true;
        this.sortOrder = data.sortOrder || 0;
    }
}
