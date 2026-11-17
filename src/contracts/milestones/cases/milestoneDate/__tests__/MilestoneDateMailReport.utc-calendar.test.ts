jest.mock('../../../../../setup/Setup', () => ({
    __esModule: true,
    default: { MilestoneStatus: { IN_PROGRESS: 'W trakcie', NOT_STARTED: 'Nie rozpoczęty' } },
}));
jest.mock('../../../../../tools/ToolsMail', () => ({
    __esModule: true, default: { sendMail: jest.fn().mockResolvedValue({}) },
}));
jest.mock('../MilestoneDatesController', () => ({
    __esModule: true, default: { find: jest.fn() },
}));
import Report from '../MilestoneDateMailReport';
import Dates from '../MilestoneDatesController';
import Mail from '../../../../../tools/ToolsMail';

// Unit policy regression; actual reader/SQL-model mapping is exercised by the isolated harness VM suite.
const report = Report as any;
describe('SQL DATE report uses calendar days in UTC', () => {
    beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
    afterEach(() => jest.useRealTimers());

    it.each(['2026-10-20T00:00:00.001Z', '2026-10-20T23:59:59.999Z'])(
        'keeps today upcoming, +7 inclusive and +8 excluded at %s', now => {
            jest.setSystemTime(new Date(now));
            const dates = [19, 20, 27, 28].map((day, i) => ({ id: i + 1, endDate: `2026-10-${day}` }));
            const result = report.filterRelevantDates(dates);
            expect(result.overdueDates.map((d: any) => d.id)).toEqual([1]);
            expect(result.upcomingDates.map((d: any) => d.id)).toEqual([2, 3]);
            expect(report.calculateDaysOverdue('2026-10-19')).toBe(1);
            expect(report.calculateDaysRemaining('2026-10-20')).toBe(0);
            expect(report.calculateDaysRemaining('2026-10-27')).toBe(7);
        }
    );

    it('uses the UTC date across a local date offset and daylight-saving boundary', () => {
        jest.setSystemTime(new Date('2026-10-25T00:30:00+02:00')); // October 24 UTC
        const result = report.filterRelevantDates([
            { id: 1, endDate: '2026-10-23' }, { id: 2, endDate: '2026-10-24' },
            { id: 3, endDate: '2026-10-31' }, { id: 4, endDate: '2026-11-01' },
        ]);
        expect(result.overdueDates.map((d: any) => d.id)).toEqual([1]);
        expect(result.upcomingDates.map((d: any) => d.id)).toEqual([2, 3]);
        expect(report.formatDate('2026-10-24')).toBe(new Date('2026-10-24').toLocaleDateString('pl-PL', { timeZone: 'UTC' }));
    });

    it('skips null, absent, empty and invalid dates without fabricating a deadline', () => {
        jest.setSystemTime(new Date('2026-10-20T23:59:59.999Z'));
        const result = report.filterRelevantDates([
            { id: 1, endDate: null }, { id: 2 }, { id: 3, endDate: '' }, { id: 4, endDate: 'invalid' },
        ]);
        expect(result).toEqual({ overdueDates: [], upcomingDates: [] });
    });

    it('keeps the source administrator as recipient and one row per supplied canonical deadline', async () => {
        jest.setSystemTime(new Date('2026-10-20T23:59:59.999Z'));
        const source = { id: 71, name: 'SYN source', number: 'SYN71', _admin: { email: 'synthetic7@example.invalid' } };
        (Dates.find as jest.Mock).mockResolvedValue([
            { id: 1, endDate: '2026-10-20', description: 'SYN canonical',
                _milestone: { id: 31, name: 'SYN milestone', _type: { name: 'SYN type' }, _contract: source },
                _occurrenceContract: { id: 72, _admin: { email: 'synthetic8@example.invalid' } } },
            { id: 2, endDate: '2026-10-28', description: 'SYN outside',
                _milestone: { id: 31, _type: { name: 'SYN type' }, _contract: source } },
        ]);
        await Report.sendOverdueAndUpcomingReport();
        expect(Dates.find).toHaveBeenCalledTimes(1);
        expect(Mail.sendMail).toHaveBeenCalledTimes(1);
        const message = (Mail.sendMail as jest.Mock).mock.calls[0][0];
        expect(message.to).toBe('synthetic7@example.invalid');
        expect(message.text.split('SYN canonical')).toHaveLength(2);
        expect(message.text).toContain('0 dni pozostało');
        expect(message.text).not.toContain('SYN outside');
    });
});