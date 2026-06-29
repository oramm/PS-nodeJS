export class BankSyncValidator {
    /**
     * Validates manual allocation request body.
     * Returns error message or null if valid.
     */
    static validateAllocationRequest(body: Record<string, unknown>): string | null {
        const { invoiceId, costInvoiceId, amount } = body;

        const hasInvoice = invoiceId !== undefined && invoiceId !== null;
        const hasCostInvoice = costInvoiceId !== undefined && costInvoiceId !== null;

        if (!hasInvoice && !hasCostInvoice) {
            return 'Wymagane invoiceId lub costInvoiceId';
        }
        if (hasInvoice && hasCostInvoice) {
            return 'Można podać tylko invoiceId albo costInvoiceId, nie oba';
        }

        if (hasInvoice && (!Number.isInteger(Number(invoiceId)) || Number(invoiceId) <= 0)) {
            return 'invoiceId musi być dodatnią liczbą całkowitą';
        }
        if (hasCostInvoice && (!Number.isInteger(Number(costInvoiceId)) || Number(costInvoiceId) <= 0)) {
            return 'costInvoiceId musi być dodatnią liczbą całkowitą';
        }

        const parsedAmount = Number(amount);
        if (amount === undefined || amount === null || isNaN(parsedAmount) || !isFinite(parsedAmount)) {
            return 'amount jest wymagany i musi być liczbą';
        }
        if (parsedAmount <= 0) {
            return 'amount musi być większy od zera';
        }

        return null;
    }
}
