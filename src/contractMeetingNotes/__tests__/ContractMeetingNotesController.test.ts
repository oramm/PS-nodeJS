import ContractMeetingNotesController from '../ContractMeetingNotesController';
import ContractMeetingNoteRepository from '../ContractMeetingNoteRepository';
import ToolsDb from '../../tools/ToolsDb';
import ToolsDocs from '../../tools/ToolsDocs';
import ToolsGd from '../../tools/ToolsGd';

describe('ContractMeetingNotesController', () => {
    const mockConn = { threadId: 1001 } as any;
    const mockAuth = { mocked: true } as any;

    beforeEach(() => {
        jest.restoreAllMocks();
        (ContractMeetingNotesController as any).instance = undefined;

        jest.spyOn(ToolsDb, 'transaction').mockImplementation(
            async (callback: any) => {
                return await callback(mockConn);
            },
        );

        jest.spyOn(
            ContractMeetingNotesController as any,
            'withAuth',
        ).mockImplementation(async (callback: any) => {
            const instance = (
                ContractMeetingNotesController as any
            ).getInstance();
            return await callback(instance, mockAuth);
        });

        jest.spyOn(ToolsGd, 'copyFile').mockResolvedValue({
            data: { id: 'doc-1' },
        } as any);
        jest.spyOn(ToolsGd, 'createPermissions').mockResolvedValue({} as any);
        jest.spyOn(ToolsGd, 'trashFileOrFolder').mockResolvedValue({} as any);

        jest.spyOn(ToolsDocs, 'initNamedRangesFromTags').mockResolvedValue(
            undefined as any,
        );
        jest.spyOn(
            ToolsDocs,
            'updateTextRunsInNamedRanges',
        ).mockResolvedValue(undefined as any);
        jest.spyOn(ToolsDocs, 'insertAgendaStructure').mockResolvedValue(
            undefined as any,
        );
        jest.spyOn(ToolsDb, 'getQueryCallbackAsync').mockResolvedValue(
            [] as any,
        );
    });

    it('creates notes folder with standard name and persists note', async () => {
        const getCreateContextSpy = jest
            .spyOn(ContractMeetingNoteRepository.prototype, 'getCreateContext')
            .mockResolvedValue({
                contractId: 77,
                contractNumber: 'C-77',
                meetingProtocolsGdFolderId: null,
                projectGdFolderId: 'project-folder-1',
            });
        const setFolderSpy = jest
            .spyOn(ToolsGd, 'setFolder')
            .mockResolvedValue({ id: 'notes-folder-1' } as any);
        const updateFolderSpy = jest
            .spyOn(
                ContractMeetingNoteRepository.prototype,
                'updateContractMeetingProtocolsGdFolderId',
            )
            .mockResolvedValue(undefined);
        const getNextSeqSpy = jest
            .spyOn(
                ContractMeetingNoteRepository.prototype,
                'getNextSequenceNumberForContract',
            )
            .mockResolvedValue(5);
        const addInDbSpy = jest
            .spyOn(ContractMeetingNoteRepository.prototype, 'addInDb')
            .mockResolvedValue(undefined as any);

        const result = await ContractMeetingNotesController.addFromDto(
            {
                contractId: 77,
                title: '  Weekly sync  ',
                description: '  ',
            },
            901,
        );

        expect(getCreateContextSpy).toHaveBeenCalledWith(77, mockConn);
        expect(setFolderSpy).toHaveBeenCalledWith(mockAuth, {
            parentId: 'project-folder-1',
            name: 'Notatki ze spotkań',
        });
        expect(updateFolderSpy).toHaveBeenCalledWith(
            77,
            'notes-folder-1',
            mockConn,
        );
        expect(getNextSeqSpy).toHaveBeenCalledWith(77, mockConn);
        expect(addInDbSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                contractId: 77,
                sequenceNumber: 5,
                title: 'Weekly sync',
                description: null,
                protocolGdId: 'doc-1',
                createdByPersonId: 901,
            }),
            mockConn,
            true,
        );
        expect(result.protocolGdId).toBe('doc-1');
    });

    it('rolls back copied google doc when DB insert fails', async () => {
        jest.spyOn(
            ContractMeetingNoteRepository.prototype,
            'getCreateContext',
        ).mockResolvedValue({
            contractId: 15,
            contractNumber: 'C-15',
            meetingProtocolsGdFolderId: 'existing-folder-15',
            projectGdFolderId: 'project-folder-15',
        });
        jest.spyOn(
            ContractMeetingNoteRepository.prototype,
            'getNextSequenceNumberForContract',
        ).mockResolvedValue(2);
        jest.spyOn(
            ContractMeetingNoteRepository.prototype,
            'addInDb',
        ).mockRejectedValue(new Error('insert failed'));

        await expect(
            ContractMeetingNotesController.addFromDto({
                contractId: 15,
                title: 'Failure scenario',
            }),
        ).rejects.toThrow('insert failed');

        expect(ToolsGd.trashFileOrFolder).toHaveBeenCalledWith(
            mockAuth,
            'doc-1',
        );
    });
});
