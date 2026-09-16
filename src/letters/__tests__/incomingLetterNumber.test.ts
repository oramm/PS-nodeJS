import {
    datePart,
    generatedNumberPrefix,
    nextDuplicateNumber,
    nextGeneratedNumber,
    numberSeriesMember,
} from '../incomingLetterNumber';

describe('incoming letter number', () => {
    it('adds the next pipe suffix and generates a daily contract sequence', () => {
        expect(numberSeriesMember('ABC/48/2026', 'ABC/48/2026|2')).toBe(true);
        expect(numberSeriesMember('ABC/48/2026', 'ABC/48/2026|x')).toBe(false);
        expect(
            nextDuplicateNumber('ABC/48/2026', [
                'ABC/48/2026',
                'ABC/48/2026|2',
                'ABC/48/2026|4',
            ])
        ).toBe('ABC/48/2026|5');

        const date = new Date('2026-09-16T12:00:00Z');
        expect(datePart(date)).toBe('160926');
        const prefix = generatedNumberPrefix('IK/15/2026', date);
        expect(prefix).toBe('IK/15/2026/160926');
        expect(
            nextGeneratedNumber(prefix, [
                'IK/15/2026/160926|01',
                'IK/15/2026/160926|03',
            ])
        ).toBe('IK/15/2026/160926|04');
    });
});
