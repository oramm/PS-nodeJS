import Validator from '../InvoiceSeriesValidator';

const input = (totalCount = 5, intervalMonths = 1, firstSaleDate: string | null = null) =>
    Validator.input({ sourceInvoiceId: 1, totalCount, intervalMonths, firstSaleDate });

describe('invoice series calendar', () => {
    it.each([
        ['2027-01-15', 5, 2, null, ['2027-01-15', '2027-03-15', '2027-05-15', '2027-07-15', '2027-09-15']],
        ['2027-01-31', 4, 1, null, ['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']],
        ['2028-01-31', 4, 1, null, ['2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30']],
        ['2027-11-30', 4, 1, null, ['2027-11-30', '2027-12-30', '2028-01-30', '2028-02-29']],
        ['2028-02-29', 3, 12, null, ['2028-02-29', '2029-02-28', '2030-02-28']],
        ['2027-01-31', 4, 1, '2027-02-28', ['2027-01-31', '2027-02-28', '2027-03-28', '2027-04-28']],
        ['2027-01-15', 4, 1, '2027-03-31', ['2027-01-15', '2027-03-31', '2027-04-30', '2027-05-31']],
        ['2027-01-15', 5, 6, null, ['2027-01-15', '2027-07-15', '2028-01-15', '2028-07-15', '2029-01-15']],
        ['2099-12-31', 4, 1, null, ['2099-12-31', '2100-01-31', '2100-02-28', '2100-03-31']],
    ])('%s, count=%s, interval=%s, first=%s', (source, count, interval, first, dates) => {
        expect(Validator.dates(source as string, input(count as number, interval as number, first as string | null))).toEqual(dates);
    });
    it('handles 50 monthly and 10 every two months', () => {
        const monthly = Validator.dates('2027-01-31', input(50));
        expect(monthly).toHaveLength(50);
        expect(monthly[49]).toBe('2031-02-28');
        const everyTwo = Validator.dates('2027-01-15', input(10, 2));
        expect(everyTwo).toHaveLength(10);
        expect(everyTwo[9]).toBe('2028-07-15');
    });
    it.each([0, 1, -1, 2.5, 101, 1001, Infinity, '5', null])('rejects invalid count %s', totalCount => {
        expect(() => Validator.input({ ...input(), totalCount })).toThrow();
    });
    it.each([0, -1, 1.5, 13, Infinity, '2', null])('rejects invalid interval %s', intervalMonths => {
        expect(() => Validator.input({ ...input(), intervalMonths })).toThrow();
    });
    it.each(['2027-02-29', '2028-02-30', 'invalid', '', '2027-1-15'])('rejects invalid date %s', firstSaleDate => {
        expect(() => input(2, 1, firstSaleDate)).toThrow();
    });
    it('accepts the maximum count and interval', () => {
        const dates = Validator.dates('2027-01-15', input(100, 12));
        expect(dates).toHaveLength(100);
        expect(dates[99]).toBe('2126-01-15');
    });
    it('rejects date overflow before writing', () => {
        expect(() => Validator.dates('9999-12-31', input())).toThrow(/9999/);
    });
});
