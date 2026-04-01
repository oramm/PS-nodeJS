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
        const bankAccount = seller.bankAccount?.replace(/\s+/g, '') || '';
        if (!bankAccount) {
            errors.push(
                'Seller bank account required (ustaw KSEF_SELLER_BANK_ACCOUNT w .env)',
            );
        } else if (bankAccount.length < 10 || bankAccount.length > 34) {
            errors.push('Seller bank account must be 10..34 chars (FA(3) NrRB)');
        }

        // Buyer info comes from _entity.taxNumber
        const buyerNipRaw = invoiceDto._entity?.taxNumber || '';
        const buyerNipNormalized = String(buyerNipRaw).replace(/\D+/g, '');

        if (!buyerNipRaw) {
            errors.push('Buyer NIP required (_entity.taxNumber)');
        } else if (!/^\d{10}$/.test(buyerNipNormalized)) {
            errors.push(
                'Buyer NIP must contain 10 digits (accepted formats: 1111111111, 111-111-11-11, 111 111 11 11)',
            );
        }

        if (!invoiceDto.issueDate) errors.push('Issue date required');
        if (!invoiceDto.sentDate) errors.push('Sent date required (P_1 for KSeF)');

        const daysToPay = Number(invoiceDto.daysToPay);
        const hasValidDaysToPay = Number.isFinite(daysToPay) && daysToPay >= 0;
        if (!hasValidDaysToPay) {
            errors.push('Valid non-negative daysToPay required');
        }

        if (
            invoiceDto.isJstSubordinate !== undefined &&
            typeof invoiceDto.isJstSubordinate !== 'boolean'
        ) {
            errors.push('isJstSubordinate must be boolean');
        }

        if (
            invoiceDto.isGvMember !== undefined &&
            typeof invoiceDto.isGvMember !== 'boolean'
        ) {
            errors.push('isGvMember must be boolean');
        }

        if (
            invoiceDto.includeThirdParty !== undefined &&
            typeof invoiceDto.includeThirdParty !== 'boolean'
        ) {
            errors.push('includeThirdParty must be boolean');
        }

        const isJstSubordinate = invoiceDto.isJstSubordinate === true;
        const isGvMember = invoiceDto.isGvMember === true;
        const includeThirdParty = Boolean(invoiceDto.includeThirdParty);
        const thirdParty = invoiceDto._thirdParty;
        const thirdPartyEntityId = invoiceDto.thirdPartyEntityId;
        const thirdParties = Array.isArray(invoiceDto._thirdParties)
            ? invoiceDto._thirdParties
            : [];
        const normalizedThirdParties = thirdParties.length
            ? thirdParties
            : includeThirdParty && (thirdPartyEntityId || thirdParty?.id)
              ? [
                    {
                        entityId: thirdPartyEntityId ?? thirdParty?.id,
                        role: isJstSubordinate ? 8 : isGvMember ? 10 : 10,
                        _entity: thirdParty,
                    },
                ]
              : [];

        if ((isJstSubordinate || isGvMember) && !includeThirdParty) {
            errors.push('Podmiot3 is required when isJstSubordinate=true or isGvMember=true (set includeThirdParty=true)');
        }

        if (includeThirdParty && normalizedThirdParties.length === 0) {
            errors.push('_thirdParties entry is required when includeThirdParty=true');
        }

        const hasRole8 = normalizedThirdParties.some(
            (item: any) => Number(item.role) === 8,
        );
        const hasRole10 = normalizedThirdParties.some(
            (item: any) => Number(item.role) === 10,
        );

        if (isJstSubordinate && !hasRole8) {
            errors.push('Role 8 is required in _thirdParties when isJstSubordinate=true');
        }

        if (isGvMember && !hasRole10) {
            errors.push('Role 10 is required in _thirdParties when isGvMember=true');
        }

        normalizedThirdParties.forEach((item: any, index: number) => {
            const role = Number(item.role);
            const entityId = item.entityId ?? item._entity?.id;
            const entityName = (item._entity?.name || '').toString().trim();

            if (!entityId) {
                errors.push(`_thirdParties[${index}].entityId or _entity.id is required`);
            }
            if (!Number.isInteger(role) || role < 1 || role > 10) {
                errors.push(`_thirdParties[${index}].role must be integer in range 1..10`);
            }
            if (!entityName) {
                errors.push(`_thirdParties[${index}] name is required`);
            }
        });

        if (!includeThirdParty && normalizedThirdParties.length > 0) {
            errors.push('includeThirdParty=false but _thirdParties contains entries');
        }

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
