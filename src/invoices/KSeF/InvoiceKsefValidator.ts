import Setup from '../../setup/Setup';

export default class InvoiceKsefValidator {
    // Stateless validator for DTO/Invoice before XML generation
    static validateForKsef(invoiceDto: any) {
        const errors: string[] = [];
        if (!invoiceDto) {
            throw new Error('KSeF validation failed: Missing invoice');
        }

        // Seller info comes from Setup.KSeF
        const sellerNip = Setup.KSeF.nip;
        if (!sellerNip)
            errors.push('Seller NIP required (ustaw KSEF_NIP w .env)');

        const { seller } = Setup.KSeF;
        if (!seller.name)
            errors.push('Seller name required (ustaw KSEF_SELLER_NAME w .env)');
        if (!seller.street)
            errors.push(
                'Seller street required (ustaw KSEF_SELLER_STREET w .env)',
            );
        if (!seller.city)
            errors.push('Seller city required (ustaw KSEF_SELLER_CITY w .env)');

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
            const err = new Error(
                `KSeF validation failed: ${errors.join(', ')}`,
            );
            // @ts-ignore
            err.validationErrors = errors;
            throw err;
        }
    }
}
