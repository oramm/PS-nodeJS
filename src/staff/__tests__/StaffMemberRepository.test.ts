import { describe, expect, it, jest } from '@jest/globals';
import ToolsDb from '../../tools/ToolsDb';
import StaffMemberRepository from '../StaffMemberRepository';

describe('StaffMemberRepository.hasSbAccessManagement', () => {
    it.each([
        [[{ value: 1 }], true],
        [[], false],
    ])('wynik zapytania %p oznacza %p', async (rows, expected) => {
        const query = jest
            .spyOn(ToolsDb, 'getQueryCallbackAsync')
            .mockResolvedValue(rows as any);
        expect(await StaffMemberRepository.hasSbAccessManagement(17)).toBe(
            expected,
        );
        expect(query).toHaveBeenCalledWith(
            expect.stringContaining('CanManageSbAccess = 1 AND IsActive = 1'),
            undefined,
            [17],
        );
        expect(query.mock.calls[0][0]).toContain('PersonId = ?');
    });
});
