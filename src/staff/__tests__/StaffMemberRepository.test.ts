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
            expect.stringContaining('CanManageSbAccess = 1'),
            undefined,
            [17],
        );
        // U2: flaga działa tylko przy aktywnym koncie logowania, nie przy StaffMembers.IsActive.
        expect(query.mock.calls[0][0]).toContain('PersonAccounts.IsActive = 1');
        expect(query.mock.calls[0][0]).not.toMatch(/StaffMembers\.IsActive|AND IsActive/);
        expect(query.mock.calls[0][0]).toContain('PersonId = ?');
    });
});

describe('StaffMemberRepository - listy osób z flagą (UPR-2)', () => {
    it.each([
        ['getScrumPersonIds', 'IsInScrum'],
        ['getDriverPersonIds', 'IsDriver'],
        ['getSiteVisitorPersonIds', 'CanLogSiteVisits'],
    ] as const)('%s bierze tylko osoby z aktywnym kontem logowania', async (method, flag) => {
        const query = jest
            .spyOn(ToolsDb, 'getQueryCallbackAsync')
            .mockResolvedValue([{ PersonId: 5 }] as any);
        expect(await StaffMemberRepository[method]()).toEqual([5]);
        const sql = String(query.mock.calls[0][0]);
        expect(sql).toContain(`${flag} = 1`);
        expect(sql).toContain('PersonAccounts.IsActive = 1');
        expect(sql).not.toMatch(/StaffMembers\.IsActive|AND IsActive/);
        query.mockRestore();
    });
});
