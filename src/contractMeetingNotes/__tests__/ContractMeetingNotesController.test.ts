import ContractMeetingNotesController from '../ContractMeetingNotesController';
import ContractMeetingNoteRepository from '../ContractMeetingNoteRepository';
import MeetingArrangementRepository from '../../meetings/meetingArrangements/MeetingArrangementRepository';
import MeetingRepository from '../../meetings/MeetingRepository';
import ToolsDb from '../../tools/ToolsDb';
import ToolsDocs from '../../tools/ToolsDocs';
import ToolsGd from '../../tools/ToolsGd';

describe('ContractMeetingNotesController', () => {
    const mockConn = { threadId: 1001 } as any;
    const mockAuth = { mocked: true } as any;
    const makeTemplateDocument = (tagNames: string[], withNamedAgenda = true) => {
        const content = tagNames.map((tagName, index) => ({
            startIndex: index * 20 + 1,
            endIndex: index * 20 + 1 + `#ENVI#${tagName}#\n`.length,
            paragraph: {
                elements: [
                    {
                        startIndex: index * 20 + 1,
                        endIndex: index * 20 + 1 + `#ENVI#${tagName}#\n`.length,
                        textRun: { content: `#ENVI#${tagName}#\n` },
                    },
                ],
            },
        }));

        const namedRanges = withNamedAgenda
            ? {
                  AGENDA_SECTION: {
                      namedRanges: [
                          {
                              name: 'AGENDA_SECTION',
                              ranges: [{ startIndex: 10, endIndex: 20 }],
                          },
                      ],
                  },
              }
            : {};

        return {
            body: { content },
            namedRanges,
        };
    };

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
        jest.spyOn(ToolsGd, 'trashFile').mockResolvedValue('ok' as any);

        jest.spyOn(ToolsDocs, 'initNamedRangesFromTags').mockResolvedValue(
            undefined as any,
        );
        jest.spyOn(
            ToolsDocs,
            'updateTextRunsInNamedRanges',
        ).mockResolvedValue(undefined as any);
        jest.spyOn(ToolsDocs, 'getDocument').mockResolvedValue({
            data: makeTemplateDocument(
                [
                    'MEETING_TITLE',
                    'MEETING_DATE',
                    'MEETING_LOCATION',
                    'CONTRACT_NUMBER',
                    'CREATED_BY',
                    'AGENDA_SECTION',
                    'EMPLOYERS',
                    'ENGINEERS',
                    'CONTRACTORS',
                ],
                true,
            ),
        } as any);
        jest.spyOn(ToolsDocs, 'insertAgendaStructure').mockResolvedValue(
            undefined as any,
        );
        jest.spyOn(ToolsDb, 'getQueryCallbackAsync').mockResolvedValue(
            [] as any,
        );

        jest.spyOn(
            ContractMeetingNoteRepository.prototype,
            'existsByMeetingId',
        ).mockResolvedValue(false);
    });

    it('creates notes folder with standard name and persists note', async () => {
        const getCreateContextSpy = jest
            .spyOn(ContractMeetingNoteRepository.prototype, 'getCreateContext')
            .mockResolvedValue({
                contractId: 77,
                contractNumber: 'C-77',
                contractGdFolderId: 'contract-folder-1',
                meetingProtocolsGdFolderId: null,
                projectGdFolderId: 'project-folder-1',
                employersText: '',
                engineersText: '',
                contractorsText: '',
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
            parentId: 'contract-folder-1',
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
            contractGdFolderId: 'contract-folder-15',
            meetingProtocolsGdFolderId: 'existing-folder-15',
            projectGdFolderId: 'project-folder-15',
            employersText: '',
            engineersText: '',
            contractorsText: '',
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

    it('addFromDto with meetingId fetches arrangements and inserts agenda structure', async () => {
        jest.spyOn(
            ContractMeetingNoteRepository.prototype,
            'getCreateContext',
        ).mockResolvedValue({
            contractId: 99,
            contractNumber: 'C-99',
            contractGdFolderId: 'contract-folder-99',
            meetingProtocolsGdFolderId: 'existing-folder-99',
            projectGdFolderId: 'project-folder-99',
            employersText: 'Employer A\nEmployer B',
            engineersText: 'Engineer A',
            contractorsText: 'Contractor A',
        });
        jest.spyOn(
            ContractMeetingNoteRepository.prototype,
            'getNextSequenceNumberForContract',
        ).mockResolvedValue(1);
        jest.spyOn(
            ContractMeetingNoteRepository.prototype,
            'addInDb',
        ).mockResolvedValue(undefined as any);
        jest.spyOn(MeetingRepository.prototype, 'find').mockResolvedValue([
            { location: 'Room A' } as any,
        ]);

        const arrangementFindSpy = jest
            .spyOn(MeetingArrangementRepository.prototype, 'find')
            .mockResolvedValue([
                {
                    name: 'Punkt 1',
                    description: 'Opis punktu',
                    _case: {
                        name: 'Sprawa testowa',
                        _type: { folderNumber: '01' },
                    },
                } as any,
            ]);

        await ContractMeetingNotesController.addFromDto({
            contractId: 99,
            title: 'Meeting with agenda',
            meetingId: 50,
        });

        expect(arrangementFindSpy).toHaveBeenCalledWith({ meetingId: 50 });
        expect(ToolsDocs.insertAgendaStructure).toHaveBeenCalledWith(
            mockAuth,
            'doc-1',
            [
                {
                    heading: '01 Sprawa testowa',
                    body: 'Opis punktu',
                },
            ],
        );
        expect(ToolsDocs.updateTextRunsInNamedRanges).toHaveBeenCalledWith(
            mockAuth,
            'doc-1',
            expect.arrayContaining([
                { rangeName: 'EMPLOYERS', newText: 'Employer A\nEmployer B' },
                { rangeName: 'ENGINEERS', newText: 'Engineer A' },
                { rangeName: 'CONTRACTORS', newText: 'Contractor A' },
            ]),
        );
    });

    it('throws when one of new placeholders is missing in template', async () => {
        jest.spyOn(
            ContractMeetingNoteRepository.prototype,
            'getCreateContext',
        ).mockResolvedValue({
            contractId: 101,
            contractNumber: 'C-101',
            contractGdFolderId: 'contract-folder-101',
            meetingProtocolsGdFolderId: 'existing-folder-101',
            projectGdFolderId: 'project-folder-101',
            employersText: '',
            engineersText: '',
            contractorsText: '',
        });
        jest.spyOn(
            ContractMeetingNoteRepository.prototype,
            'getNextSequenceNumberForContract',
        ).mockResolvedValue(3);
        jest.spyOn(
            ContractMeetingNoteRepository.prototype,
            'addInDb',
        ).mockResolvedValue(undefined as any);
        jest.spyOn(ToolsDocs, 'getDocument').mockResolvedValue({
            data: makeTemplateDocument(
                [
                    'MEETING_TITLE',
                    'MEETING_DATE',
                    'MEETING_LOCATION',
                    'CONTRACT_NUMBER',
                    'CREATED_BY',
                    'AGENDA_SECTION',
                    'EMPLOYERS',
                    'ENGINEERS',
                ],
                false,
            ),
        } as any);

        await expect(
            ContractMeetingNotesController.addFromDto({
                contractId: 101,
                title: 'Meeting without placeholder',
                meetingId: 51,
            }),
        ).rejects.toThrow(
            'Szablon Google Docs jest niekompletny. Brakuje tagów: #ENVI#CONTRACTORS#',
        );
        expect(ToolsDocs.insertAgendaStructure).not.toHaveBeenCalled();
    });

    it('throws when template contains no valid ENVI tags', async () => {
        jest.spyOn(
            ContractMeetingNoteRepository.prototype,
            'getCreateContext',
        ).mockResolvedValue({
            contractId: 102,
            contractNumber: 'C-102',
            contractGdFolderId: 'contract-folder-102',
            meetingProtocolsGdFolderId: 'existing-folder-102',
            projectGdFolderId: 'project-folder-102',
            employersText: '',
            engineersText: '',
            contractorsText: '',
        });
        jest.spyOn(
            ContractMeetingNoteRepository.prototype,
            'getNextSequenceNumberForContract',
        ).mockResolvedValue(4);
        jest.spyOn(
            ContractMeetingNoteRepository.prototype,
            'addInDb',
        ).mockResolvedValue(undefined as any);
        jest.spyOn(ToolsDocs, 'getDocument').mockResolvedValue({
            data: {
                body: {
                    content: [
                        {
                            startIndex: 1,
                            endIndex: 10,
                            paragraph: {
                                elements: [
                                    {
                                        startIndex: 1,
                                        endIndex: 10,
                                        textRun: { content: '#zmienna\n' },
                                    },
                                ],
                            },
                        },
                    ],
                },
                namedRanges: {},
            },
        } as any);

        await expect(
            ContractMeetingNotesController.addFromDto({
                contractId: 102,
                title: 'Meeting invalid template',
            }),
        ).rejects.toThrow(
            'Szablon Google Docs ma błędny format znaczników. Wymagany format to #ENVI#NAZWA#.',
        );
    });

    it('passes empty strings for relation placeholders when contract has no entities', async () => {
        jest.spyOn(
            ContractMeetingNoteRepository.prototype,
            'getCreateContext',
        ).mockResolvedValue({
            contractId: 103,
            contractNumber: 'C-103',
            contractGdFolderId: 'contract-folder-103',
            meetingProtocolsGdFolderId: 'existing-folder-103',
            projectGdFolderId: 'project-folder-103',
            employersText: '',
            engineersText: '',
            contractorsText: '',
        });
        jest.spyOn(
            ContractMeetingNoteRepository.prototype,
            'getNextSequenceNumberForContract',
        ).mockResolvedValue(1);
        jest.spyOn(
            ContractMeetingNoteRepository.prototype,
            'addInDb',
        ).mockResolvedValue(undefined as any);

        await ContractMeetingNotesController.addFromDto({
            contractId: 103,
            title: 'Meeting without entities',
        });

        expect(ToolsDocs.updateTextRunsInNamedRanges).toHaveBeenCalledWith(
            mockAuth,
            'doc-1',
            expect.arrayContaining([
                { rangeName: 'EMPLOYERS', newText: '' },
                { rangeName: 'ENGINEERS', newText: '' },
                { rangeName: 'CONTRACTORS', newText: '' },
            ]),
        );
    });

    describe('deleteById', () => {
        it('trashes all Google Drive files and deletes all duplicates when note has a meetingId', async () => {
            const findSpy = jest
                .spyOn(ContractMeetingNoteRepository.prototype, 'find')
                .mockResolvedValueOnce([
                    {
                        id: 10,
                        meetingId: 55,
                        contractId: 1,
                        protocolGdId: 'doc-base',
                    } as any,
                ])
                .mockResolvedValueOnce([
                    {
                        id: 10,
                        meetingId: 55,
                        contractId: 1,
                        protocolGdId: 'doc-base',
                    } as any,
                    {
                        id: 11,
                        meetingId: 55,
                        contractId: 1,
                        protocolGdId: 'doc-dup',
                    } as any,
                    {
                        id: 12,
                        meetingId: 55,
                        contractId: 1,
                        protocolGdId: null,
                    } as any,
                    {
                        id: 13,
                        meetingId: 55,
                        contractId: 1,
                        protocolGdId: '   ',
                    } as any,
                ]);
            const trashFileSpy = jest.spyOn(ToolsGd, 'trashFile');
            const deleteByMeetingIdSpy = jest
                .spyOn(
                    ContractMeetingNoteRepository.prototype,
                    'deleteByMeetingIdInDb',
                )
                .mockResolvedValue(undefined);
            const deleteFromDbSpy = jest.spyOn(
                ContractMeetingNoteRepository.prototype,
                'deleteFromDb',
            );

            await ContractMeetingNotesController.deleteById(10);

            expect(findSpy).toHaveBeenNthCalledWith(1, [{ id: 10 }]);
            expect(findSpy).toHaveBeenNthCalledWith(2, [{ meetingId: 55 }]);
            expect(trashFileSpy).toHaveBeenCalledTimes(2);
            expect(trashFileSpy).toHaveBeenNthCalledWith(1, mockAuth, 'doc-base');
            expect(trashFileSpy).toHaveBeenNthCalledWith(2, mockAuth, 'doc-dup');
            expect(deleteByMeetingIdSpy).toHaveBeenCalledWith(55);
            expect(deleteFromDbSpy).not.toHaveBeenCalled();
        });

        it('trashes a single Google Drive file and deletes one record when note has no meetingId', async () => {
            const noteWithoutMeeting = {
                id: 20,
                meetingId: null,
                contractId: 1,
                protocolGdId: 'doc-single',
            } as any;
            jest.spyOn(ContractMeetingNoteRepository.prototype, 'find').mockResolvedValue([
                noteWithoutMeeting,
            ]);
            const trashFileSpy = jest.spyOn(ToolsGd, 'trashFile');
            const deleteByMeetingIdSpy = jest.spyOn(
                ContractMeetingNoteRepository.prototype,
                'deleteByMeetingIdInDb',
            );
            const deleteFromDbSpy = jest
                .spyOn(ContractMeetingNoteRepository.prototype, 'deleteFromDb')
                .mockResolvedValue(undefined as any);

            await ContractMeetingNotesController.deleteById(20);

            expect(trashFileSpy).toHaveBeenCalledWith(mockAuth, 'doc-single');
            expect(deleteFromDbSpy).toHaveBeenCalledWith(noteWithoutMeeting);
            expect(deleteByMeetingIdSpy).not.toHaveBeenCalled();
        });

        it('throws when note is not found', async () => {
            jest.spyOn(ContractMeetingNoteRepository.prototype, 'find').mockResolvedValue([]);

            await expect(
                ContractMeetingNotesController.deleteById(999),
            ).rejects.toThrow('ContractMeetingNote with id=999 not found');
        });

        it('throws for invalid id', async () => {
            await expect(
                ContractMeetingNotesController.deleteById(0),
            ).rejects.toThrow('id must be a positive integer');
        });
    });

    describe('addFromDto 1:1 meeting guard', () => {
        it('throws when a note already exists for the meetingId', async () => {
            jest.spyOn(
                ContractMeetingNoteRepository.prototype,
                'getCreateContext',
            ).mockResolvedValue({
                contractId: 200,
                contractNumber: 'C-200',
                contractGdFolderId: 'contract-folder-200',
                meetingProtocolsGdFolderId: 'folder-200',
                projectGdFolderId: 'project-200',
                employersText: '',
                engineersText: '',
                contractorsText: '',
            });
            jest.spyOn(
                ContractMeetingNoteRepository.prototype,
                'existsByMeetingId',
            ).mockResolvedValue(true);

            await expect(
                ContractMeetingNotesController.addFromDto({
                    contractId: 200,
                    title: 'Duplicate meeting note',
                    meetingId: 77,
                }),
            ).rejects.toThrow(
                'A meeting note already exists for meetingId=77',
            );

            expect(ToolsGd.copyFile).not.toHaveBeenCalled();
        });

        it('proceeds normally when no note exists yet for the meetingId', async () => {
            jest.spyOn(
                ContractMeetingNoteRepository.prototype,
                'getCreateContext',
            ).mockResolvedValue({
                contractId: 201,
                contractNumber: 'C-201',
                contractGdFolderId: 'contract-folder-201',
                meetingProtocolsGdFolderId: 'folder-201',
                projectGdFolderId: 'project-201',
                employersText: '',
                engineersText: '',
                contractorsText: '',
            });
            jest.spyOn(
                ContractMeetingNoteRepository.prototype,
                'existsByMeetingId',
            ).mockResolvedValue(false);
            jest.spyOn(
                ContractMeetingNoteRepository.prototype,
                'getNextSequenceNumberForContract',
            ).mockResolvedValue(1);
            jest.spyOn(
                ContractMeetingNoteRepository.prototype,
                'addInDb',
            ).mockResolvedValue(undefined as any);
            jest.spyOn(MeetingRepository.prototype, 'find').mockResolvedValue([]);
            jest.spyOn(
                MeetingArrangementRepository.prototype,
                'find',
            ).mockResolvedValue([]);

            const result = await ContractMeetingNotesController.addFromDto({
                contractId: 201,
                title: 'New meeting note',
                meetingId: 88,
            });

            expect(result.protocolGdId).toBe('doc-1');
        });

        it('throws when a missing meeting notes folder cannot fall back to contract folder', async () => {
            const setFolderSpy = jest.spyOn(ToolsGd, 'setFolder');
            jest.spyOn(
                ContractMeetingNoteRepository.prototype,
                'getCreateContext',
            ).mockResolvedValue({
                contractId: 202,
                contractNumber: 'C-202',
                contractGdFolderId: null,
                meetingProtocolsGdFolderId: null,
                projectGdFolderId: 'project-202',
                employersText: '',
                engineersText: '',
                contractorsText: '',
            });
            jest.spyOn(
                ContractMeetingNoteRepository.prototype,
                'existsByMeetingId',
            ).mockResolvedValue(false);

            await expect(
                ContractMeetingNotesController.addFromDto({
                    contractId: 202,
                    title: 'Missing contract folder',
                }),
            ).rejects.toThrow(
                'Contract 202 does not have contract Google Drive folder',
            );

            expect(setFolderSpy).not.toHaveBeenCalled();
        });
    });
});
