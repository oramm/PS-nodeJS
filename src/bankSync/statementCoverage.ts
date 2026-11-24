type StatementPeriod = { periodFrom: string; periodTo: string };

export type StatementMonth = {
    month: string;
    status: 'covered' | 'partial' | 'missing';
    coveredThrough: string | null;
};

export function statementCoverage(periods: StatementPeriod[], today: string) {
    const ranges = periods.filter(p => p.periodFrom <= p.periodTo && p.periodFrom <= today)
        .sort((a, b) => a.periodFrom.localeCompare(b.periodFrom));
    const months: StatementMonth[] = [];
    const gaps: StatementPeriod[] = [];
    if (!ranges.length) return { months, gaps };

    const dayAfter = (day: string) => shiftedDate(day, 1);
    const dayBefore = (day: string) => shiftedDate(day, -1);
    const first = ranges[0].periodFrom;
    let cursor = first;
    for (const period of ranges) {
        if (period.periodFrom > cursor) {
            gaps.push({ periodFrom: cursor, periodTo: dayBefore(period.periodFrom) });
        }
        const next = dayAfter(period.periodTo < today ? period.periodTo : today);
        if (next > cursor) cursor = next;
    }

    const currentMonthStart = `${today.slice(0, 7)}-01`;
    if (cursor <= today) {
        gaps.push({ periodFrom: cursor, periodTo: today });
    }

    for (let from = `${first.slice(0, 7)}-01`; from <= today;) {
        const end = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0))
            .toISOString().slice(0, 10);
        const coveredThrough = ranges.reduce<string | null>((last, period) => {
            if (period.periodFrom > end || period.periodTo < from) return last;
            const until = [period.periodTo, end, today].sort()[0];
            return !last || until > last ? until : last;
        }, null);
        const hasGap = gaps.some(gap => gap.periodFrom <= end && gap.periodTo >= from);
        months.push({
            month: from.slice(0, 7),
            status: !coveredThrough ? 'missing'
                : coveredThrough < end || hasGap || from < first ? 'partial' : 'covered',
            coveredThrough,
        });
        from = dayAfter(end);
    }
    return {
        months,
        gaps: gaps.filter(gap => gap.periodFrom < currentMonthStart).map(gap => ({
            ...gap,
            periodTo: gap.periodTo < currentMonthStart ? gap.periodTo : dayBefore(currentMonthStart),
        })),
    };
}

function shiftedDate(day: string, shift: number): string {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + shift);
    return date.toISOString().slice(0, 10);
}
