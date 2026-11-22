import { statementCoverage } from '../statementCoverage';

describe('statementCoverage', () => {
    it('unites overlapping and adjoining statements and reports a missing month and a partial current month', () => {
        const result = statementCoverage([
            { periodFrom: '2026-08-24', periodTo: '2026-09-01' },
            { periodFrom: '2026-06-01', periodTo: '2026-06-30' },
            { periodFrom: '2026-08-01', periodTo: '2026-08-23' },
        ], '2026-09-22');
        expect(result).toEqual({
            gaps: [{ periodFrom: '2026-07-01', periodTo: '2026-07-31' }],
            months: [
                { month: '2026-06', status: 'covered', coveredThrough: '2026-06-30' },
                { month: '2026-07', status: 'missing', coveredThrough: null },
                { month: '2026-08', status: 'covered', coveredThrough: '2026-08-31' },
                { month: '2026-09', status: 'partial', coveredThrough: '2026-09-01' },
            ],
        });
    });

    it('warns about missing days in the previous month and keeps the missing current month on the timeline', () => {
        const result = statementCoverage([
            { periodFrom: '2024-02-01', periodTo: '2024-02-27' },
            { periodFrom: '2024-02-29', periodTo: '2024-02-29' },
        ], '2024-03-12');
        expect(result.gaps).toEqual([
            { periodFrom: '2024-02-28', periodTo: '2024-02-28' },
        ]);
        expect(result.months.map(month => month.status)).toEqual(['partial', 'missing']);
    });

    it('ends a gap crossing into the current month on the last day of the previous month', () => {
        const result = statementCoverage([
            { periodFrom: '2026-09-01', periodTo: '2026-09-29' },
            { periodFrom: '2026-11-10', periodTo: '2026-11-22' },
        ], '2026-11-22');
        expect(result.gaps).toEqual([{ periodFrom: '2026-09-30', periodTo: '2026-10-31' }]);
        expect(result.months.map(month => month.status)).toEqual(['partial', 'missing', 'partial']);
    });

    it('does not mark dates before the first import as gaps', () => {
        expect(statementCoverage([], '2026-01-01')).toEqual({ months: [], gaps: [] });
        expect(statementCoverage([
            { periodFrom: '2026-01-12', periodTo: '2026-01-31' },
        ], '2026-01-22')).toEqual({
            months: [{ month: '2026-01', status: 'partial', coveredThrough: '2026-01-22' }],
            gaps: [],
        });
    });
});
