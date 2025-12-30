export default class InvoiceKsefValidator {
    // Stateless validator for DTO/Invoice before XML generation
    static validateForKsef(invoiceDto: any) {
        const errors: string[] = [];
        if (!invoiceDto) errors.push('Missing invoice');
        
        // Seller NIP comes from ENV
        const sellerNip = process.env.KSEF_NIP;
        if (!sellerNip) errors.push('Seller NIP required (ustaw KSEF_NIP w .env)');
        
        // Buyer info comes from _entity.taxNumber
        if (!invoiceDto._entity || !invoiceDto._entity.taxNumber) {
            errors.push('Buyer NIP required (_entity.taxNumber)');
        }
        
        if (!invoiceDto.issueDate) errors.push('Issue date required');
        
        // Total is _totalNetValue
        const total = invoiceDto._totalNetValue;
        if (total === undefined || total === null) {
            errors.push('Total required (_totalNetValue)');
        }

        if (errors.length) {
            const err = new Error(`KSeF validation failed: ${errors.join(', ')}`);
            // @ts-ignore
            err.validationErrors = errors;
            throw err;
        }
    }
}
