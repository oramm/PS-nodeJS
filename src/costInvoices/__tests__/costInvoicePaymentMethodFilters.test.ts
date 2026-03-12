import {
    buildPaymentMethodFilterSql,
    normalizePaymentMethodForFilter,
    PaymentMethodFilterValues,
} from '../costInvoicePaymentMethodFilters';

describe('costInvoicePaymentMethodFilters', () => {
    it('normalizes polish diacritics for payment method matching', () => {
        expect(normalizePaymentMethodForFilter('  Gotówka ')).toBe('gotowka');
    });

    it('builds SQL and params for bank transfer filter', () => {
        expect(buildPaymentMethodFilterSql(PaymentMethodFilterValues.BANK_TRANSFER)).toEqual({
            condition:
                "(LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(ci.PaymentMethod, 'ą', 'a'), 'ć', 'c'), 'ę', 'e'), 'ł', 'l'), 'ń', 'n'), 'ó', 'o'), 'ś', 's'), 'ż', 'z'), 'ź', 'z')) LIKE ?)",
            params: ['%przelew%'],
        });
    });

    it('builds SQL for other or empty payment methods', () => {
        const result = buildPaymentMethodFilterSql(PaymentMethodFilterValues.OTHER_OR_EMPTY);

        expect(result.condition).toContain("COALESCE(TRIM(ci.PaymentMethod), '') = ''");
        expect(result.condition).toContain("NOT LIKE ?");
        expect(result.params).toEqual([
            '%przelew%',
            '%gotowka%',
            '%karta%',
            '%mobil%',
            '%bon%',
            '%czek%',
            '%kredyt%',
        ]);
    });

    it('throws for unsupported filter value', () => {
        expect(() => buildPaymentMethodFilterSql('WIRE')).toThrow(
            'Nieobsługiwany filtr formy płatności: WIRE',
        );
    });
});
