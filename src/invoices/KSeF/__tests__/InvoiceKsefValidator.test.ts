jest.mock('../../../setup/Setup', () => ({
    __esModule: true,
    default: {
        KSeF: {
            nip: '1234567890',
            seller: {
                name: 'ENVI Sp. z o.o.',
                street: 'ul. Lubicz 25',
                city: 'Krakow',
                bankAccount: 'PL61109010140000071219812874',
            },
        },
    },
}));

import InvoiceKsefValidator from '../InvoiceKsefValidator';

describe('InvoiceKsefValidator Podmiot3 rules', () => {
    const makeInvoiceDto = (overrides: Record<string, any> = {}) => ({
        issueDate: '2026-04-01',
        sentDate: '2026-04-02',
        daysToPay: 14,
        _totalNetValue: 100,
        _entity: {
            taxNumber: '9876543210',
        },
        ...overrides,
    });

    it('does not require Podmiot3 for legacy invoices without explicit JST/GV flags', () => {
        expect(() => {
            InvoiceKsefValidator.validateForKsef(makeInvoiceDto());
        }).not.toThrow();
    });

    it('requires Podmiot3 when GV is explicitly true', () => {
        expect(() => {
            InvoiceKsefValidator.validateForKsef(
                makeInvoiceDto({
                    isGvMember: true,
                    includeThirdParty: false,
                }),
            );
        }).toThrow(/Podmiot3 is required/);
    });

    it('requires third-party reference when includeThirdParty=true', () => {
        expect(() => {
            InvoiceKsefValidator.validateForKsef(
                makeInvoiceDto({
                    includeThirdParty: true,
                }),
            );
        }).toThrow(/_thirdParties entry is required/);
    });

    it('allows Podmiot3 without JST/GV when entity is selected', () => {
        expect(() => {
            InvoiceKsefValidator.validateForKsef(
                makeInvoiceDto({
                    includeThirdParty: true,
                    _thirdParties: [
                        {
                            entityId: 123,
                            role: 4,
                            _entity: {
                                id: 123,
                                name: 'Podmiot niezalezny',
                            },
                        },
                    ],
                }),
            );
        }).not.toThrow();
    });

    it('requires Podmiot3 name for effective role 10 without JST/GV', () => {
        expect(() => {
            InvoiceKsefValidator.validateForKsef(
                makeInvoiceDto({
                    includeThirdParty: true,
                    _thirdParties: [
                        {
                            entityId: 124,
                            role: 10,
                            _entity: {
                                id: 124,
                                name: '',
                            },
                        },
                    ],
                }),
            );
        }).toThrow(/_thirdParties\[0\] name is required/);
    });

    it('requires role 8 when JST=true', () => {
        expect(() => {
            InvoiceKsefValidator.validateForKsef(
                makeInvoiceDto({
                    isJstSubordinate: true,
                    includeThirdParty: true,
                    _thirdParties: [
                        {
                            entityId: 201,
                            role: 4,
                            _entity: { id: 201, name: 'Inny podmiot' },
                        },
                    ],
                }),
            );
        }).toThrow(/Role 8 is required/);
    });
});
