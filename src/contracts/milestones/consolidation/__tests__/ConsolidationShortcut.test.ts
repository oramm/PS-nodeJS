import Controller from '../ConsolidationShortcutController';
import FinalizationRepository from '../ConsolidationFinalizationRepository';
import Sharing from '../../sharing/MilestoneSharingRepository';
import Lifecycle from '../../sharing/MilestoneLifecycleController';
import Shortcut from '../../sharing/MilestoneShortcutController';

jest.mock('../../sharing/MilestoneShortcutController', () => ({
    __esModule: true, default: { ensure: jest.fn() },
}));

const operationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const user = { enviId: 7, systemRoleId: 1 } as Parameters<typeof Controller.prepare>[2];
const scope = { projectOurIds: ['TEST'] };
const conn = {} as Parameters<Parameters<typeof Lifecycle.runWithConnection>[0]>[0];
const ready = { ContractId: 10, OperationId: null, ShortcutStatus: 'READY', ShortcutId: 'managed-shortcut' };
const pending = { ...ready, ShortcutStatus: 'PENDING', ShortcutId: null };

function fixture(moved = true) {
    jest.spyOn(Lifecycle, 'runWithConnection').mockImplementation(action => action(conn));
    const authorize = jest.spyOn(FinalizationRepository.prototype, 'authorize').mockResolvedValue({
        state: { state: 'TRANSFERRING', destinationMilestoneId: 42, accountingContractId: 20,
            participantContractIds: [10, 20], units: [{ moved }] },
    } as Awaited<ReturnType<FinalizationRepository['authorize']>>);
    const snapshot = jest.spyOn(Sharing.prototype, 'snapshot').mockResolvedValue({
        m: { Id: 42 }, links: [pending], dates: [], revision: null,
    });
    return { authorize, snapshot };
}

it('prepares only the existing shortcut for the authorized operation, then confirms its stored identity', async () => {
    const { authorize, snapshot } = fixture();
    snapshot.mockResolvedValueOnce({ m: {}, links: [pending], dates: [], revision: null })
        .mockResolvedValueOnce({ m: {}, links: [ready], dates: [], revision: null });
    await expect(Controller.prepare(operationId, '10', user, scope)).resolves.toEqual({ operationId, contractId: 10 });
    expect(authorize).toHaveBeenCalledWith(operationId, user, scope, conn);
    expect(Shortcut.ensure).toHaveBeenCalledWith(42, 10);
});

it('returns the existing shortcut after a repeated request without starting a second Drive operation', async () => {
    const { snapshot } = fixture();
    snapshot.mockResolvedValue({ m: {}, links: [ready], dates: [], revision: null });
    await expect(Controller.prepare(operationId, '10', user, scope)).resolves.toEqual({ operationId, contractId: 10 });
    expect(Shortcut.ensure).not.toHaveBeenCalled();
});

it.each(['20', '99'])('refuses contract %s outside the required links before Drive', async contractId => {
    fixture();
    await expect(Controller.prepare(operationId, contractId, user, scope)).rejects.toMatchObject({ code: 'SHORTCUT_ACTION_UNAVAILABLE' });
    expect(Shortcut.ensure).not.toHaveBeenCalled();
});

it('refuses an incomplete transfer before Drive', async () => {
    fixture(false);
    await expect(Controller.prepare(operationId, '10', user, scope)).rejects.toMatchObject({ code: 'SHORTCUT_ACTION_UNAVAILABLE' });
    expect(Shortcut.ensure).not.toHaveBeenCalled();
});

it('refuses a missing association rather than creating a new link', async () => {
    const { snapshot } = fixture();
    snapshot.mockResolvedValue({ m: {}, links: [], dates: [], revision: null });
    await expect(Controller.prepare(operationId, '10', user, scope)).rejects.toMatchObject({ code: 'SHORTCUT_ACTION_UNAVAILABLE' });
    expect(Shortcut.ensure).not.toHaveBeenCalled();
});

it('keeps a failed Drive preparation visible without confirming success', async () => {
    fixture();
    await expect(Controller.prepare(operationId, '10', user, scope)).rejects.toMatchObject({ code: 'SHORTCUT_PREPARATION_FAILED' });
});
