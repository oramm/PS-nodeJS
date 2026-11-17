jest.mock('../MilestoneShortcutController', () => ({ __esModule: true, default: { ensure: jest.fn() } }));
jest.mock('../../../../setup/Sessions/ToolsGapi', () => ({ oAuthClient: {} }));
jest.mock('../../../../tools/ToolsDb', () => ({ __esModule: true, default: { pool: { getConnection: jest.fn() }, transaction: jest.fn() } }));
import ToolsDb from '../../../../tools/ToolsDb';
import Controller from '../MilestoneSharingController';
import Repository from '../MilestoneSharingRepository';
import Validator from '../MilestoneSharingValidator';
import Lifecycle from '../MilestoneLifecycleController';
import ShortcutController from '../MilestoneShortcutController';
import Operations from '../../consolidation/ConsolidationOperationRepository';
import FinalizationRepository from '../../consolidation/ConsolidationFinalizationRepository';
import { AGENT_SYSTEM_EMAIL } from '../../../../setup/Sessions/agentTokenAuth';

describe('sharing authorization and revision boundaries', () => {
    const user = { enviId: 125, systemRoleId: 3, systemEmail: 'synthetic@example.invalid' } as any;
    it.each([1, 2, 3])('role %i may manage sharing', role => {
        expect(() => Validator.actor({ ...user, systemRoleId: role })).not.toThrow();
    });
    it.each([0, 4, 5, 6, 7, undefined])('role %p may not manage sharing', role => {
        expect(() => Validator.actor({ ...user, systemRoleId: role })).toThrow('ROLE_DENIED');
    });
    it('denies missing session and the actual agent identity on delete', () => {
        expect(() => Validator.actor()).toThrow('SESSION_REQUIRED');
        expect(() => Validator.actor({ ...user, systemEmail: AGENT_SYSTEM_EMAIL }, true)).toThrow('AGENT_DESTRUCTIVE_DENIED');
    });
    it('requires access to every affected contract, not just one', () => {
        expect(() => Validator.scope([{ ProjectOurId: 'A' }, { ProjectOurId: 'B' }], { projectOurIds: ['A'] })).toThrow('SCOPE_DENIED');
    });
    it.each(['0', '01', '1.0', '1e2', ' 1', '-1', '2147483648', NaN, null, {}])('rejects ambiguous route id %p', value => {
        expect(() => Validator.id(value)).toThrow('INVALID_REQUEST');
    });
    it('keeps stale protection after the last detach without blocking deletion of an unlinked entity', () => {
        const m = { Id: 1 };
        expect(() => Validator.legacy(m, {}, [], 'current', false, true)).toThrow('STALE_REVISION');
        expect(() => Validator.legacy(m, { _sharingRevision: 'current' }, [], 'current', false, true)).not.toThrow();
        expect(() => Validator.legacy(m, {}, [], 'current', true, true)).not.toThrow();
    });
    it('keeps old unshared payloads compatible', () => {
        expect(() => Validator.legacy({ Id: 1 }, {}, [], 'current', false)).not.toThrow();
    });
});

describe('lifecycle lock ownership', () => {
    let conn: any;
    beforeEach(() => {
        conn = { release: jest.fn(), destroy: jest.fn() };
        (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue(conn);
        jest.spyOn(Repository.prototype, 'acquire').mockResolvedValue(true);
        jest.spyOn(Repository.prototype, 'release').mockResolvedValue(undefined);
    });
    afterEach(() => jest.restoreAllMocks());
    it('serializes concurrent actions and supports nested controllers without reacquiring', async () => {
        const events: string[] = [];
        await Promise.all([
            Controller.runExclusive(async () => {
                events.push('a');
                await Controller.runExclusive(async () => { events.push('nested'); });
                await new Promise(resolve => setTimeout(resolve, 5));
                events.push('b');
            }),
            Controller.runExclusive(async () => { events.push('c'); }),
        ]);
        expect(events).toEqual(['a', 'nested', 'b', 'c']);
        expect(Repository.prototype.acquire).toHaveBeenCalledTimes(2);
    });
    it('releases after a rejection and allows the next action', async () => {
        await expect(Controller.runExclusive(async () => { throw new Error('denied'); })).rejects.toThrow('denied');
        await expect(Controller.runExclusive(async () => 42)).resolves.toBe(42);
        expect(conn.release).toHaveBeenCalledTimes(2);
    });
    it('never executes action after a lock timeout', async () => {
        (Repository.prototype.acquire as jest.Mock).mockResolvedValueOnce(false);
        const effect = jest.fn();
        await expect(Controller.runExclusive(effect)).rejects.toThrow('RETRYABLE_STORAGE_ERROR');
        expect(effect).not.toHaveBeenCalled();
    });
    it('connection acquisition failure does not poison the process queue', async () => {
        (ToolsDb.pool.getConnection as jest.Mock).mockRejectedValueOnce(new Error('connection'));
        await expect(Controller.runExclusive(async () => 1)).rejects.toThrow('connection');
        await expect(Controller.runExclusive(async () => 2)).resolves.toBe(2);
    });
});

describe('attach to an occupied destination', () => {
    const user = { enviId: 125, systemRoleId: 3, systemEmail: 'synthetic@example.invalid' } as any;
    const initial = { m: { Id: 10, ContractId: 1, TypeId: 5, OfferId: null }, links: [], dates: [], revision: null };
    const body = { requestId: 'd6b25916-7420-4a46-b193-3dc1c2aab723', expectedRevision: Controller.revision(initial) };
    beforeEach(() => {
        jest.spyOn(Controller, 'runExclusive').mockImplementation(async action => action());
        jest.spyOn(Lifecycle, 'run').mockImplementation(async action => action());
        (ToolsDb.pool.getConnection as jest.Mock).mockResolvedValue({query: jest.fn(async () => [[]]),release: jest.fn()});
        (ToolsDb.transaction as jest.Mock).mockImplementation(async action => action({}));
        jest.spyOn(Repository.prototype, 'snapshot').mockResolvedValue(initial as any);
        jest.spyOn(Repository.prototype, 'contracts').mockResolvedValue([
            { Id: 1, ProjectOurId: 'OWN', TypeId: 1 },
            { Id: 2, ProjectOurId: 'OWN', TypeId: 2 },
        ]);
        jest.spyOn(Repository.prototype, 'receipt').mockResolvedValue(undefined);
        jest.spyOn(Repository.prototype, 'availability').mockResolvedValue([{}]);
        jest.spyOn(Repository.prototype, 'uniqueConflicts').mockResolvedValue([]);
        jest.spyOn(Repository.prototype, 'attach').mockResolvedValue(undefined);
        jest.spyOn(Repository.prototype, 'touch').mockResolvedValue(undefined);
        jest.spyOn(Repository.prototype, 'saveReceipt').mockResolvedValue(undefined);
        jest.spyOn(Repository.prototype, 'updateReceipt').mockResolvedValue(undefined);
    });
    afterEach(() => jest.restoreAllMocks());

    it('rejects a contract with its own type-5 milestone before inserting a link', async () => {
        jest.spyOn(Repository.prototype, 'ownedConflict').mockResolvedValue([{ Id: 12 }]);
        await expect(Controller.mutate(10, 2, 'PUT', body, user)).rejects.toThrow('DESTINATION_OCCUPIED');
        expect(Repository.prototype.attach).not.toHaveBeenCalled();
    });

    function transferredShortcut(occupiedId = 12) {
        const snapshot = { ...initial, links: [{ ContractId: 2, ShortcutStatus: 'PENDING', OperationId: null }] };
        (Repository.prototype.snapshot as jest.Mock).mockResolvedValue(snapshot);
        jest.spyOn(Repository.prototype, 'ownedConflict').mockResolvedValue([{ Id: occupiedId }]);
        jest.spyOn(Operations.prototype, 'involving').mockResolvedValue(['operation']);
        const authorize = jest.spyOn(FinalizationRepository.prototype, 'authorize').mockResolvedValue({
            state: { state: 'TRANSFERRING', sourceMilestoneId: 12, destinationMilestoneId: 10,
                accountingContractId: 1, participantContractIds: [1, 2], units: [{ moved: true }] },
        } as any);
        return { snapshot, authorize, request: { ...body, expectedRevision: Controller.revision(snapshot) } };
    }

    it('finishes the existing link for the source of a recorded transfer without attaching again', async () => {
        const { snapshot, authorize, request } = transferredShortcut();
        (ShortcutController.ensure as jest.Mock).mockImplementationOnce(async () => {
            (Repository.prototype.snapshot as jest.Mock).mockResolvedValue({
                ...snapshot, links: [{ ...snapshot.links[0], ShortcutId: 'owned-shortcut', ShortcutStatus: 'READY' }],
            });
        });
        const scope = { projectOurIds: ['OWN'] };
        await expect(Controller.mutate(10, 2, 'PUT', request, user, scope)).resolves.toMatchObject({ shortcutStatus: 'READY' });
        expect(authorize).toHaveBeenCalledWith('operation', user, scope, expect.anything());
        expect(Repository.prototype.attach).not.toHaveBeenCalled();
        expect(ShortcutController.ensure).toHaveBeenCalledWith(10, 2, undefined);
    });

    it('blocks the repair when the occupied milestone differs from the transfer source', async () => {
        const { request } = transferredShortcut(13);
        await expect(Controller.mutate(10, 2, 'PUT', request, user)).rejects.toThrow('DESTINATION_OCCUPIED');
        expect(Repository.prototype.saveReceipt).not.toHaveBeenCalled();
        expect(ShortcutController.ensure).not.toHaveBeenCalled();
    });

    it('resumes an authorized request if Drive was ready before the confirmation was saved', async () => {
        const { snapshot, authorize, request } = transferredShortcut();
        (Repository.prototype.snapshot as jest.Mock).mockResolvedValue({
            ...snapshot, links: [{ ...snapshot.links[0], ShortcutId: 'owned-shortcut', ShortcutStatus: 'READY' }],
        });
        (Repository.prototype.receipt as jest.Mock).mockResolvedValue({
            Payload: JSON.stringify({ expectedRevision: request.expectedRevision }),
            Result: JSON.stringify({ phase: 'TRANSFERRED_SHORTCUT_PENDING' }),
        });
        await expect(Controller.mutate(10, 2, 'PUT', request, user)).resolves.toMatchObject({ shortcutStatus: 'READY' });
        expect(authorize).toHaveBeenCalledTimes(1);
        expect(Repository.prototype.attach).not.toHaveBeenCalled();
        expect(Repository.prototype.saveReceipt).not.toHaveBeenCalled();
    });

    it('allows an otherwise eligible destination without an own type-5 milestone', async () => {
        jest.spyOn(Repository.prototype, 'ownedConflict').mockResolvedValue([]);
        (Repository.prototype.snapshot as jest.Mock).mockResolvedValueOnce(initial).mockResolvedValue({
            ...initial,
            links: [{ ContractId: 2, ShortcutStatus: 'PENDING', OperationId: null }],
        });
        const result = await Controller.mutate(10, 2, 'PUT', body, user);
        expect(Repository.prototype.attach).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({ milestoneId: 10, contractId: 2, shortcutStatus: 'PENDING' });
    });
});
