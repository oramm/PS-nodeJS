jest.mock('../../../../../setup/Sessions/ToolsGapi', () => ({ oAuthClient: {} }));
jest.mock('../../../../../tools/ToolsDb', () => ({ __esModule: true, default: { pool: {} } }));
jest.mock('../../../../../tools/ToolsSheets', () => ({ __esModule: true, default: {} }));
jest.mock('../../../sharing/MilestoneSharingController', () => ({ __esModule: true, default: { runExclusive: (action: () => Promise<unknown>) => action() } }));
import TasksController from '../TasksController';
import TaskRepository from '../TaskRepository';
import CaseRepository from '../../CaseRepository';
import Task from '../Task';
import Setup from '../../../../../setup/Setup';

it('keeps shared task ownership and selected-field readback with legacy sync disabled', async () => {
    jest.spyOn(Setup, 'scrumSheetSyncEnabled', 'get').mockReturnValue(false);
    const current = new Task({id: 12, name: 'before', _parent: {id: 10, milestoneId: 20}} as any);
    const saved = new Task({id: 12, name: 'after', _parent: {id: 10, milestoneId: 20}} as any);
    const lookup = jest.spyOn(TaskRepository.prototype, 'findById').mockResolvedValue(current);
    const shared = jest.spyOn(CaseRepository.prototype, 'hasSharedMilestone').mockResolvedValue(true);
    const write = jest.spyOn(TaskRepository.prototype, 'editInDb').mockResolvedValue(undefined as any);
    await expect(TasksController.edit({id: 12, _case: {id: 99}} as any, ['caseId'], {} as any))
        .rejects.toThrow('Przenoszenie wspólnego zadania');
    expect(shared).toHaveBeenCalledWith(20);
    expect(write).not.toHaveBeenCalled();
    lookup.mockResolvedValueOnce(current).mockResolvedValueOnce(saved);
    expect(await TasksController.edit({id: 12, name: 'after', _case: {id: 99}} as any, ['name'], {} as any)).toBe(saved);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][3]).toEqual(['name']);
    expect(saved.caseId).toBe(10);
});
