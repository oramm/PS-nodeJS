export default class PaymentAllocation {
    id?: number;
    bankTransferId: number;
    invoiceId?: number | null;
    costInvoiceId?: number | null;
    allocatedAmount: number;
    allocatedPercentage: number;
    source: 'AUTO' | 'MANUAL';
    confidence?: number | null;
    createdBy?: number | null;
    createdAt?: Date;

    constructor(data: Partial<PaymentAllocation> & { bankTransferId: number; allocatedAmount: number; allocatedPercentage: number; source: 'AUTO' | 'MANUAL' }) {
        this.id = data.id;
        this.bankTransferId = data.bankTransferId;
        this.invoiceId = data.invoiceId ?? null;
        this.costInvoiceId = data.costInvoiceId ?? null;
        this.allocatedAmount = data.allocatedAmount;
        this.allocatedPercentage = data.allocatedPercentage;
        this.source = data.source;
        this.confidence = data.confidence ?? null;
        this.createdBy = data.createdBy ?? null;
        this.createdAt = data.createdAt;
    }
}
