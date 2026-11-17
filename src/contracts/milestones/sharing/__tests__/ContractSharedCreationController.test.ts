jest.mock('../../../../setup/Sessions/ToolsGapi', () => ({ oAuthClient: {} }));
jest.mock('../../../aqmSync/AqmSync', () => ({
    isAqmContractType: jest.fn(() => false), enqueueAqmPush: jest.fn(), tryDeliverAfterCommit: jest.fn(),
}));
jest.mock('../../../fidmanSync/FidmanSync', () => ({
    lockFidmanFoldersContracts: jest.fn(async () => []),
    enqueueFidmanFoldersForContracts: jest.fn(async () => []),
    deliverFidmanFoldersAfterCommit: jest.fn(async () => undefined),
    isFidmanSyncEligible: jest.fn(() => false), enqueueFidmanContractPush: jest.fn(), tryDeliverAfterCommit: jest.fn(),
}));

import ToolsDb from '../../../../tools/ToolsDb';
import Setup from '../../../../setup/Setup';
import ContractOther from '../../../ContractOther';
import ContractRepository from '../../../ContractRepository';
import ContractsController from '../../../ContractsController';
import ContractEntityController from '../../../ContractEntityController';
import ContractLeaderValidator from '../../../ContractLeaderValidator';
import ContractTemplatesTreeController from '../../../contractTemplatesTree/ContractTemplatesTreeController';
import MilestoneRepository from '../../MilestoneRepository';
import MilestonesController from '../../MilestonesController';
import Sharing from '../MilestoneSharingController';
import Repository from '../MilestoneSharingRepository';
import Controller from '../ContractSharedCreationController';
import Shortcut from '../MilestoneShortcutController';

const user = { enviId: 999999, systemRoleId: 3, systemEmail: 'synthetic@example.invalid' } as any;
const selected = { mode: 'shared', milestoneTypeId: 5, milestoneId: 4889, expectedRevision: '' };
const dto = (): any => ({ _creationRequestId: '23456789-1234-4234-8234-123456789abc',
    _milestonesSelection: [{ mode: 'own', milestoneTypeId: 1, caseTypeIds: [7] }, { ...selected }] });

function contract() {
    const item: any = Object.assign(Object.create(ContractOther.prototype), {
        alias: 'TEST', name: 'Test contract', number: 'MC4A2/1',
        startDate: '2026-09-01', endDate: '2027-09-01', typeId: 2,
        _project: { id: 111 }, projectOurId: 'OWN',
        createFolders: jest.fn(async function (this: any) {
            this.gdFolderId = 'mock:contract';
            this.meetingProtocolsGdFolderId = 'mock:meeting';
        }),
        setGdFolderIdAndUrl: jest.fn(function (this: any, id: string) { this.gdFolderId = id; }),
    });
    return item;
}

describe('shared milestone in a new contract', () => {
    let receipt: { Payload: string; Result: string } | undefined;
    let owned: any[];
    let cases: number;
    const repository = Repository.prototype;

    beforeEach(() => {
        jest.restoreAllMocks();
        receipt = undefined;
        owned = [];
        cases = 0;
        jest.spyOn(Setup, 'scrumSheetSyncEnabled', 'get').mockReturnValue(false);
        jest.spyOn(Sharing, 'runExclusive').mockImplementation(async action => action());
        jest.spyOn(ToolsDb, 'transaction').mockImplementation(async (action: any) => action({}));
        jest.spyOn(ContractsController, 'createContractFromDto').mockImplementation(async () => contract());
        jest.spyOn(ContractLeaderValidator, 'validate').mockImplementation(() => undefined);
        jest.spyOn(ContractRepository.prototype, 'isUniquePerProject').mockResolvedValue(false);
        jest.spyOn(ContractRepository.prototype, 'addInDb').mockImplementation(async item => { item.id = 301; });
        jest.spyOn(ContractEntityController, 'addAssociations').mockResolvedValue(undefined as any);
        jest.spyOn(repository, 'creationProject').mockResolvedValue({ Id: 111, OurId: 'OWN', GdFolderId: 'mock:project' });
        jest.spyOn(repository, 'creationContractType').mockResolvedValue({ Id: 2, IsOur: 0 });
        jest.spyOn(repository, 'creationReceipt').mockImplementation(async () => receipt);
        jest.spyOn(repository, 'reserveCreation').mockImplementation(async (_actor, _id, payload, result) => {
            receipt = { Payload: payload, Result: JSON.stringify(result) };
        });
        jest.spyOn(repository, 'updateCreation').mockImplementation(async (_actor, _id, result) => {
            receipt = { Payload: receipt!.Payload, Result: JSON.stringify(result) };
        });
        jest.spyOn(repository, 'snapshot').mockResolvedValue({
            m: { Id: 4889, TypeId: 5, ContractId: 1974, OfferId: null },
            links: [], dates: [], revision: null,
        });
        jest.spyOn(Shortcut, 'ensure').mockImplementation(async () => {
            const snapshot = await repository.snapshot(4889);
            snapshot.links = [{ ContractId: 301, ShortcutStatus: 'READY' }];
        });
        jest.spyOn(repository, 'contracts').mockResolvedValue([{ Id: 1974, ProjectOurId: 'OWN' }]);
        jest.spyOn(repository, 'availability').mockResolvedValue([{ MilestoneTypeId: 5, ContractTypeId: 2 }]);
        jest.spyOn(repository, 'attach').mockResolvedValue(undefined as any);
        jest.spyOn(repository, 'touch').mockResolvedValue(undefined as any);
        jest.spyOn(repository, 'ownedMilestones').mockImplementation(async () => owned);
        jest.spyOn(repository, 'caseCount').mockImplementation(async () => cases);
        jest.spyOn(ContractTemplatesTreeController, 'resolveSelection').mockResolvedValue([{
            milestoneType: { id: 1, isUniquePerContract: true }, name: 'Administracja',
            caseTypes: [{ caseType: { id: 7 }, name: 'Sprawa' }],
        }] as any);
        jest.spyOn(MilestoneRepository.prototype, 'findById').mockResolvedValue({ id: 500 } as any);
        jest.spyOn(MilestonesController, 'createDefaultCases').mockImplementation(async () => { cases = 1; });
    });

    it('resumes after own milestone was saved and never repeats the contract or link', async () => {
        const request = dto();
        request._milestonesSelection[1].expectedRevision = Sharing.revision(await repository.snapshot(4889));
        const first = (await Controller.prepare(request, user, { projectOurIds: ['OWN'] }))!;
        jest.spyOn(MilestonesController, 'createFolders').mockResolvedValue({ id: 'mock:milestone' } as any);
        jest.spyOn(MilestoneRepository.prototype, 'addMilestonesWithDates').mockImplementation(async () => {
            owned = [{ Id: 500, TypeId: 1, Name: 'Administracja' }];
            return [];
        });
        const create = jest.spyOn(MilestonesController, 'createDefaultCases')
            .mockRejectedValueOnce(new Error('injected failure after milestone insert'))
            .mockImplementation(async () => { cases = 1; });
        await expect(Controller.add(first, {} as any, 'task')).rejects.toThrow('injected failure');
        expect(JSON.parse(receipt!.Result)).toMatchObject({ stage: 'LINKED', contractId: 301 });

        const second = (await Controller.prepare(request, user, { projectOurIds: ['OWN'] }))!;
        await Controller.add(second, {} as any, 'retry');
        expect(JSON.parse(receipt!.Result)).toMatchObject({ stage: 'DONE', contractId: 301 });
        expect(ContractRepository.prototype.addInDb).toHaveBeenCalledTimes(1);
        expect(repository.attach).toHaveBeenCalledTimes(1);
        expect(create).toHaveBeenCalledTimes(2);
        expect(MilestonesController.createDefaultCases).toHaveBeenCalledTimes(2);
        expect(create).toHaveBeenCalledWith(expect.anything(), expect.anything(),
            expect.objectContaining({ isPartOfBatch: true }));
        const third = (await Controller.prepare(request, user, { projectOurIds: ['OWN'] }))!;
        await Controller.add(third, {} as any, 'replay');
        expect(ContractRepository.prototype.addInDb).toHaveBeenCalledTimes(1);
        expect(repository.attach).toHaveBeenCalledTimes(1);
    });

    it('denies stale source and foreign project before reserving or creating folders', async () => {
        const request = dto();
        request._milestonesSelection[1].expectedRevision = 'a'.repeat(64);
        await expect(Controller.prepare(request, user, { projectOurIds: ['OWN'] }))
            .rejects.toThrow('STALE_REVISION');
        await expect(Controller.prepare(request, user, { projectOurIds: ['FOREIGN'] }))
            .rejects.toThrow('SCOPE_DENIED');
        expect(repository.reserveCreation).not.toHaveBeenCalled();
    });
    it('keeps a durable documents step on failure and retries without duplicating the contract or Scrum work', async () => {
        const request = dto();
        request._milestonesSelection = [request._milestonesSelection[1]];
        request._milestonesSelection[0].expectedRevision = Sharing.revision(await repository.snapshot(4889));
        jest.mocked(Shortcut.ensure).mockImplementationOnce(async () => {
            (await repository.snapshot(4889)).links = [{ ContractId: 301, ShortcutStatus: 'FAILED' }];
        });
        const first = (await Controller.prepare(request, user, { projectOurIds: ['OWN'] }))!;
        await expect(Controller.add(first, {} as any, 'failed-documents')).rejects.toThrow('SHORTCUT_NOT_READY');
        expect(JSON.parse(receipt!.Result)).toMatchObject({ stage: 'DOCUMENTS_PENDING', contractId: 301 });
        const second = (await Controller.prepare(request, user, { projectOurIds: ['OWN'] }))!;
        const result = await Controller.add(second, {} as any, 'retry-documents');
        expect(result.shortcutStatus).toBe('READY');
        expect(result.contract.id).toBe(301);
        expect(ContractRepository.prototype.addInDb).toHaveBeenCalledTimes(1);
        expect(repository.attach).toHaveBeenCalledTimes(1);
        expect(first.contract.createFolders).toHaveBeenCalledTimes(1);
        expect(second.contract.createFolders).not.toHaveBeenCalled();
        expect(JSON.parse(receipt!.Result).stage).toBe('DONE');
        const snapshot = await repository.snapshot(4889);
        snapshot.links = [];
        const replay = await Controller.add(second, {} as any, 'replay-after-detach');
        expect(replay.shortcutStatus).toBeUndefined();
        expect(Shortcut.ensure).toHaveBeenCalledTimes(2);
        expect(repository.attach).toHaveBeenCalledTimes(1);
    });

});
