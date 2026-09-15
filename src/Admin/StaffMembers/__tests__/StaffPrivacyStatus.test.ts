import StaffMembersController from '../StaffMembersController';
import PrivacyRepository from '../../../persons/privacy/PrivacyRepository';
import { currentNotice } from '../../../persons/privacy/PrivacyNotice';
import ToolsDb from '../../../tools/ToolsDb';
jest.mock('../../../tools/ToolsDb');

describe('staff privacy status (read only)', () => {
    afterEach(() => jest.restoreAllMocks());
    const acknowledgedAt = '2026-09-15T08:30:00.000Z';
    it.each([
        [null, 'missing'],
        [{version: currentNotice('SYSTEM').version, acknowledgedAt}, 'confirmed'],
        [{version: 'older', acknowledgedAt}, 'outdated'],
    ] as const)('reports %s as %s', async (record, expected) => {
        const find = jest.spyOn(PrivacyRepository.prototype, 'findForAdmin').mockResolvedValue(record);
        expect(await StaffMembersController.privacyStatus('42')).toEqual({status: expected, acknowledgedAt: record?.acknowledgedAt ?? null});
        expect(find).toHaveBeenCalledWith(42, 'SYSTEM', currentNotice('SYSTEM').version);
    });
    it('rejects invalid person identifiers before querying', async () => {
        const find = jest.spyOn(PrivacyRepository.prototype, 'findForAdmin');
        await expect(StaffMembersController.privacyStatus('invalid')).rejects.toThrow();
        expect(find).not.toHaveBeenCalled();
    });
    it('does not turn a database failure into a missing acknowledgement', async () => {
        jest.spyOn(PrivacyRepository.prototype, 'findForAdmin').mockRejectedValue(new Error('database unavailable'));
        await expect(StaffMembersController.privacyStatus(42)).rejects.toThrow('database unavailable');
    });
    it('selects the current material version first, otherwise the latest acknowledgement, scoped to the person and SYSTEM', async () => {
        const query = ToolsDb.getQueryCallbackAsync as jest.Mock;
        query.mockResolvedValue([{version: 'current', acknowledgedAt}]);
        expect(await new PrivacyRepository().findForAdmin(42, 'SYSTEM', 'current')).toEqual({version: 'current', acknowledgedAt});
        expect(query).toHaveBeenLastCalledWith(expect.stringContaining("WHERE PersonId=42 AND Scope='SYSTEM' ORDER BY (Version='current') DESC, AcknowledgedAt DESC, Id DESC LIMIT 1"));
    });
});