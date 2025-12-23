export default class InvoiceKsefValidator {
    // Stateless validator for DTO/Invoice before XML generation
    static validateForKsef(invoiceDto: any) {
        const errors: string[] = [];
        if (!invoiceDto) errors.push('Missing invoice');
        if (!invoiceDto._seller || !invoiceDto._seller.nip) errors.push('Seller NIP required');
        if (!invoiceDto._buyer || !invoiceDto._buyer.nip) errors.push('Buyer NIP required');
        if (!invoiceDto.issueDate) errors.push('Issue date required');
        if (!invoiceDto.total && invoiceDto.total !== 0) errors.push('Total required');

        if (errors.length) {
            const err = new Error(`KSeF validation failed: ${errors.join(', ')}`);
            // @ts-ignore
            err.validationErrors = errors;
            throw err;
        }
    }
}
