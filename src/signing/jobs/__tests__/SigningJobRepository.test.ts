import mysql from 'mysql2/promise';
import Setup from '../../../setup/Setup';
import ToolsDb from '../../../tools/ToolsDb';
import SigningJobRepository, { NewJob, NewSignature } from '../SigningJobRepository';

jest.mock('../../../tools/ToolsDb', () => ({
    __esModule: true,
    default: { getQueryCallbackAsync: jest.fn(), executeSQL: jest.fn() },
}));

const query = ToolsDb.getQueryCallbackAsync as jest.Mock;
const execute = ToolsDb.executeSQL as jest.Mock;
const conn = {} as mysql.PoolConnection;
const repository = new SigningJobRepository();

beforeEach(() => {
    jest.spyOn(Setup, 'ContractDocuments', 'get').mockReturnValue({ caseTypeIds: [85, 75], batchLimit: 50 });
    query.mockReset();
    execute.mockReset();
});

describe('contract signing repository', () => {
    it('reads the saved main offer document ID rather than deriving it from a filename', async () => {
        query.mockResolvedValue([{ Id: 71, Alias: 'BOL.AGL.03', IsOur: 1,
            GdDocumentId: ' OWN_DOC_ID ', CaseGdFolderId: 'FOLDER_A' }]);
        expect(await repository.getOfferContext(71)).toMatchObject({ gdDocumentId: 'OWN_DOC_ID', isOur: true });
        expect(query).toHaveBeenCalledWith(expect.stringContaining('Offers.GdDocumentId'), undefined, [100, 71]);
    });

    it('uses configured case types, trims and deduplicates folders, and prefers the ENVI label', async () => {
        query.mockResolvedValue([
            { Id: 55, Number: 'External', OurId: 'ENVI-55', CaseGdFolderId: ' FOLDER_A ' },
            { Id: 55, Number: 'External', OurId: 'ENVI-55', CaseGdFolderId: 'FOLDER_A' },
            { Id: 55, Number: 'External', OurId: 'ENVI-55', CaseGdFolderId: ' FOLDER_B ' },
            { Id: 55, Number: 'External', OurId: 'ENVI-55', CaseGdFolderId: ' ' },
            { Id: 55, Number: 'External', OurId: 'ENVI-55', CaseGdFolderId: null },
        ]);
        expect(await repository.getContractContext(55, conn)).toEqual({
            id: 55, label: 'ENVI-55', isOur: true, documentFolderIds: ['FOLDER_A', 'FOLDER_B'],
        });
        expect(query).toHaveBeenCalledWith(expect.stringContaining('Cases.TypeId IN (?)'), conn, [[85, 75], 55]);
        const sql = query.mock.calls[0][0];
        expect(sql).toContain('OurContractsData.Id = Contracts.Id');
        expect(sql).toContain('Milestones.ContractId = Contracts.Id');
        expect(sql).toContain('Cases.MilestoneId = Milestones.Id');
        expect(sql).toContain('WHERE Contracts.Id = ?');
    });

    it('an empty type list disables the case join without IN ()', async () => {
        jest.spyOn(Setup, 'ContractDocuments', 'get').mockReturnValue({ caseTypeIds: [], batchLimit: 50 });
        query.mockResolvedValue([{ Id: 55, OurId: 'ENVI-55', CaseGdFolderId: null }]);
        expect((await repository.getContractContext(55))?.documentFolderIds).toEqual([]);
        expect(query).toHaveBeenCalledWith(expect.stringContaining('AND 1 = 0'), undefined, [55]);
        expect(query.mock.calls[0][0]).not.toMatch(/IN\s*\(/u);
    });

    it.each(['External', null])('uses the contract number or an empty label for another contract: %s', async (number) => {
        query.mockResolvedValue([{ Id: 55, OurId: null, Number: number, CaseGdFolderId: null }]);
        expect(await repository.getContractContext(55)).toEqual({
            id: 55, label: number ?? '', isOur: false, documentFolderIds: [],
        });
    });

    it('does not interpret an empty OurId as a missing ENVI row', async () => {
        query.mockResolvedValue([{ Id: 55, OurId: '', Number: 'External' }]);
        expect(await repository.getContractContext(55)).toMatchObject({ isOur: true, label: '' });
    });

    it('returns undefined when the contract does not exist', async () => {
        query.mockResolvedValue([]);
        expect(await repository.getContractContext(55)).toBeUndefined();
    });

    it('writes the contract source and reads it back for jobs and signatures', async () => {
        const now = new Date('2026-10-10T10:00:00Z');
        const job: NewJob = {
            tokenHash: 'hash', letterId: null, offerId: null, contractId: 55,
            createdByPersonId: 125, minProgramVersion: '1.0.0', createdAt: now, expiresAt: now,
        };
        const signature: NewSignature = {
            sourceType: 'CONTRACT_DOCUMENT', sourceGdFileId: 'CONTRACT_DOC_ID_001',
            signedGdFileId: 'SIGNED_DOC_ID_001', signedName: 'Umowa_pdp.pdf',
            letterId: null, offerId: null, contractId: 55, method: 'LOCAL_APP',
            certSubjectCn: 'Jan Testowy', certSerial: 'AA', certIssuer: 'Test CA',
            signerPersonId: 125, jobId: 1, signedAt: now,
        };
        execute.mockResolvedValue({ insertId: 1 });
        expect(await repository.insertJob(job, conn)).toBe(1);
        expect(execute).toHaveBeenLastCalledWith(expect.stringContaining('LetterId, OfferId, ContractId'),
            ['hash', null, null, 55, 125, '1.0.0', now, now], conn);
        expect(await repository.insertSignature(signature, conn)).toBe(1);
        expect(execute).toHaveBeenLastCalledWith(expect.stringContaining('LetterId, OfferId, ContractId'),
            ['CONTRACT_DOCUMENT', 'CONTRACT_DOC_ID_001', 'SIGNED_DOC_ID_001', 'Umowa_pdp.pdf',
                null, null, 55, 'LOCAL_APP', 'Jan Testowy', 'AA', 'Test CA', 125, 1, now], conn);
        for (const [sql, params] of execute.mock.calls) expect(sql.match(/\?/gu)).toHaveLength(params.length);

        query.mockResolvedValue([{ Id: 1, ContractId: 55 }]);
        expect(await repository.findJobById(1)).toMatchObject({ letterId: null, offerId: null, contractId: 55 });
        expect(await repository.findJobByTokenHash('hash')).toMatchObject({ contractId: 55 });
        query.mockResolvedValue([{ Id: 1, ContractId: 55, SourceType: 'CONTRACT_DOCUMENT', SignedAt: now }]);
        expect(await repository.listSignaturesByContractId(55, conn)).toEqual([
            expect.objectContaining({ letterId: null, offerId: null, contractId: 55, sourceType: 'CONTRACT_DOCUMENT' }),
        ]);
        expect(query).toHaveBeenLastCalledWith(expect.stringContaining('WHERE ContractId IN (?)'), conn, [[55]]);
    });
});
