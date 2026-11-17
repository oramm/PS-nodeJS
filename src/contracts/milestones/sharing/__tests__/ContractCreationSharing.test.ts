jest.mock('../../../../setup/Sessions/ToolsGapi', () => ({ oAuthClient: {} }));
jest.mock('../../../../tools/ToolsDb', () => ({ __esModule: true, default: { pool: { getConnection: jest.fn() } } }));

import Controller from '../MilestoneSharingController';
import Repository from '../MilestoneSharingRepository';
import CreationValidator from '../ContractCreationSharingValidator';

const revision = 'a'.repeat(64);
const user = { enviId: 125, systemRoleId: 3, systemEmail: 'synthetic@example.invalid' } as any;

describe('new contract shared milestone choice', () => {
    it('keeps legacy own selection and accepts exactly one explicit shared type-5 choice', () => {
        expect(CreationValidator.parse(undefined)).toBeUndefined();
        expect(CreationValidator.parse([{ milestoneTypeId: 1, caseTypeIds: [2] }])).toBeUndefined();
        expect(CreationValidator.parse([
            { milestoneTypeId: 1, caseTypeIds: [2] },
            { mode: 'shared', milestoneTypeId: 5, milestoneId: 4889, expectedRevision: revision },
        ])).toEqual({ mode: 'shared', milestoneTypeId: 5, milestoneId: 4889, expectedRevision: revision });
    });

    for (const selection of [
        [{ mode: 'shared', milestoneTypeId: 5, milestoneId: 4889, expectedRevision: revision, caseTypeIds: [] }],
        [{ mode: 'shared', milestoneTypeId: 5, milestoneId: 4889, expectedRevision: revision }, { milestoneTypeId: 5, caseTypeIds: [] }],
        [{ mode: 'shared', milestoneTypeId: 5, milestoneId: 4889, expectedRevision: revision }, { mode: 'shared', milestoneTypeId: 5, milestoneId: 4889, expectedRevision: revision }],
        [{ mode: 'shared', milestoneTypeId: 6, milestoneId: 4889, expectedRevision: revision }],
        [{ mode: 'shared', milestoneTypeId: 5, milestoneId: 4889, expectedRevision: 'stale' }],
        [{ mode: 'shared', milestoneTypeId: 5, milestoneId: '01', expectedRevision: revision }],
        [{ mode: 'shraed', milestoneTypeId: 5, milestoneId: 4889, expectedRevision: revision }],
    ]) {
        it('rejects malformed or conflicting shared instruction', () => {
            expect(() => CreationValidator.parse(selection)).toThrow('INVALID_REQUEST');
        });
    }
});

describe('read-only contract creation candidates', () => {
    afterEach(() => jest.restoreAllMocks());

    it('returns only a scoped, eligible source with a current revision', async () => {
        jest.spyOn(Controller, 'runExclusive').mockImplementation(async action => action());
        jest.spyOn(Repository.prototype, 'contractCreationCandidates').mockResolvedValue([
            { Id: 4889, Name: 'Przetarg', ContractId: 1974, SourceContractName: 'Źródło', SourceContractAlias: 'A', SourceContractOurId: 'A/1' },
            { Id: 4890, Name: 'Zajęty', ContractId: 1976, SourceContractName: 'Inne', SourceContractAlias: 'C', SourceContractOurId: 'C/1' },
        ]);
        jest.spyOn(Repository.prototype, 'snapshot').mockImplementation(async id => ({
            m: { Id: id, ContractId: id === 4889 ? 1974 : 1976, TypeId: 5, OfferId: null },
            links: id === 4889 ? [] : [{ ContractId: 1977, OperationId: 'active' }],
            dates: [], revision: null,
        }));
        jest.spyOn(Repository.prototype, 'contracts').mockResolvedValue([
            { Id: 1974, ProjectOurId: 'OWN' },
        ]);

        const result = await Controller.contractCreationCandidates('OWN', 2, user, { projectOurIds: ['OWN'] });
        expect(Repository.prototype.contractCreationCandidates).toHaveBeenCalledWith('OWN', 2);
        expect(result).toEqual([{ milestoneId: 4889, milestoneName: 'Przetarg',
            sourceContractId: 1974, sourceContractName: 'Źródło', sourceContractAlias: 'A',
            sourceContractOurId: 'A/1', expectedRevision: expect.stringMatching(/^[a-f0-9]{64}$/) }]);
    });

    it('denies unauthorized role and project before any database read', async () => {
        const rows = jest.spyOn(Repository.prototype, 'contractCreationCandidates');
        await expect(Controller.contractCreationCandidates('OWN', 2,
            { ...user, systemRoleId: 4 }, { projectOurIds: ['OWN'] })).rejects.toThrow('ROLE_DENIED');
        await expect(Controller.contractCreationCandidates('FOREIGN', 2,
            user, { projectOurIds: ['OWN'] })).rejects.toThrow('SCOPE_DENIED');
        await expect(Controller.contractCreationCandidates('OWN', '02', user)).rejects.toThrow('INVALID_REQUEST');
        expect(rows).not.toHaveBeenCalled();
    });
});
