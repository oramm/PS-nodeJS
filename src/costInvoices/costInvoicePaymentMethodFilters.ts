export const PaymentMethodFilterValues = {
    BANK_TRANSFER: 'BANK_TRANSFER',
    CASH: 'CASH',
    CARD: 'CARD',
    MOBILE: 'MOBILE',
    VOUCHER: 'VOUCHER',
    CHECK: 'CHECK',
    CREDIT: 'CREDIT',
    OTHER_OR_EMPTY: 'OTHER_OR_EMPTY',
} as const;

export type PaymentMethodFilterValue =
    typeof PaymentMethodFilterValues[keyof typeof PaymentMethodFilterValues];

const PAYMENT_METHOD_FILTER_PATTERNS: Record<
    Exclude<PaymentMethodFilterValue, 'OTHER_OR_EMPTY'>,
    string[]
> = {
    BANK_TRANSFER: ['przelew'],
    CASH: ['gotowka'],
    CARD: ['karta'],
    MOBILE: ['mobil'],
    VOUCHER: ['bon'],
    CHECK: ['czek'],
    CREDIT: ['kredyt'],
};

export function normalizePaymentMethodForFilter(value: string): string {
    return value
        .trim()
        .toLocaleLowerCase('pl-PL')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

export function buildPaymentMethodFilterSql(
    filterValue: string,
    columnSql = 'ci.PaymentMethod',
): { condition: string; params: string[] } {
    const normalizedColumnSql =
        `LOWER(` +
        `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${columnSql}, ` +
        `'ą', 'a'), 'ć', 'c'), 'ę', 'e'), 'ł', 'l'), 'ń', 'n'), 'ó', 'o'), 'ś', 's'), 'ż', 'z'), 'ź', 'z'))`;

    if (filterValue === PaymentMethodFilterValues.OTHER_OR_EMPTY) {
        const negativeConditions: string[] = [];
        const params: string[] = [];

        Object.values(PAYMENT_METHOD_FILTER_PATTERNS).forEach((patterns) => {
            patterns.forEach((pattern) => {
                negativeConditions.push(`${normalizedColumnSql} NOT LIKE ?`);
                params.push(`%${pattern}%`);
            });
        });

        return {
            condition: `(COALESCE(TRIM(${columnSql}), '') = '' OR (${negativeConditions.join(' AND ')}))`,
            params,
        };
    }

    const patterns =
        PAYMENT_METHOD_FILTER_PATTERNS[
            filterValue as Exclude<PaymentMethodFilterValue, 'OTHER_OR_EMPTY'>
        ];

    if (!patterns) {
        throw new Error(`Nieobsługiwany filtr formy płatności: ${filterValue}`);
    }

    return {
        condition: `(${patterns.map(() => `${normalizedColumnSql} LIKE ?`).join(' OR ')})`,
        params: patterns.map((pattern) => `%${pattern}%`),
    };
}
