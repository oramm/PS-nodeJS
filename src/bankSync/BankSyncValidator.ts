export class BankSyncValidator {
    /**
     * Validates manual allocation request body.
     * Returns error message or null if valid.
     */
    static validateAllocationRequest(body: Record<string, unknown>): string | null {
        const { invoiceId, costInvoiceId, amount, expectedRemaining } = body;

        const hasInvoice = invoiceId !== undefined && invoiceId !== null;
        const hasCostInvoice = costInvoiceId !== undefined && costInvoiceId !== null;

        if (!hasInvoice && !hasCostInvoice) {
            return 'Wybierz fakturę';
        }
        if (hasInvoice && hasCostInvoice) {
            return 'Wybierz jedną fakturę';
        }

        if (hasInvoice && (!Number.isInteger(Number(invoiceId)) || Number(invoiceId) <= 0)) {
            return 'Nieprawidłowa faktura sprzedaży';
        }
        if (hasCostInvoice && (!Number.isInteger(Number(costInvoiceId)) || Number(costInvoiceId) <= 0)) {
            return 'Nieprawidłowa faktura kosztowa';
        }

        const parsedAmount = Number(amount);
        if (amount === undefined || amount === null || isNaN(parsedAmount) || !isFinite(parsedAmount)) {
            return 'Podaj prawidłową kwotę';
        }
        if (parsedAmount <= 0) {
            return 'Kwota musi być większa od zera';
        }
        if (expectedRemaining !== undefined &&
            (!Number.isFinite(Number(expectedRemaining)) || Number(expectedRemaining) <= 0))
            return 'Kwota dostępna do przypisania musi być większa od zera';

        return null;
    }
}
