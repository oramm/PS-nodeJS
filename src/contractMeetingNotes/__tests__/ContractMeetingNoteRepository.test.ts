import ToolsDb from '../../tools/ToolsDb';
import ContractMeetingNoteRepository from '../ContractMeetingNoteRepository';

describe('ContractMeetingNoteRepository.find', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('builds SQL contractId filter from orConditions', async () => {
        const querySpy = jest
            .spyOn(ToolsDb, 'getQueryCallbackAsync')
            .mockResolvedValue([]);
        const repository = new ContractMeetingNoteRepository();

        await repository.find([{ contractId: 42 }]);

        const sql = querySpy.mock.calls[0][0] as string;
        expect(sql).toContain('ContractMeetingNotes.ContractId = 42');
    });

    it('supports read scenario with meetingId', async () => {
        const querySpy = jest
            .spyOn(ToolsDb, 'getQueryCallbackAsync')
            .mockResolvedValue([
                {
                    Id: 9,
                    ContractId: 42,
                    MeetingId: 314,
                    SequenceNumber: 3,
                    Title: 'Status meeting',
                    Description: null,
                    MeetingDate: null,
                    ProtocolGdId: null,
                    CreatedByPersonId: null,
                    LastUpdated: null,
                    ContractNumber: null,
                    ContractName: null,
                    CreatedById: null,
                    CreatedByName: null,
                    CreatedBySurname: null,
                    CreatedByEmail: null,
                },
            ] as any);
        const repository = new ContractMeetingNoteRepository();

        const result = await repository.find([{ meetingId: 314 }]);

        const sql = querySpy.mock.calls[0][0] as string;
        expect(sql).toContain('ContractMeetingNotes.MeetingId = 314');
        expect(result[0].meetingId).toBe(314);
    });
});

describe('ContractMeetingNoteRepository.existsByMeetingId', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('returns true when a note exists for the meetingId', async () => {
        const executeMock = jest
            .fn()
            .mockResolvedValueOnce([[{ 1: 1 }]]);
        const repository = new ContractMeetingNoteRepository();

        const result = await repository.existsByMeetingId(99, {
            execute: executeMock,
        } as any);

        expect(result).toBe(true);
        expect(executeMock).toHaveBeenCalledWith(
            expect.stringContaining('WHERE MeetingId = ?'),
            [99],
        );
    });

    it('returns false when no note exists for the meetingId', async () => {
        const executeMock = jest
            .fn()
            .mockResolvedValueOnce([[]]);
        const repository = new ContractMeetingNoteRepository();

        const result = await repository.existsByMeetingId(100, {
            execute: executeMock,
        } as any);

        expect(result).toBe(false);
    });
});

describe('ContractMeetingNoteRepository.deleteByMeetingIdInDb', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('issues DELETE for all notes with the given meetingId', async () => {
        const querySpy = jest
            .spyOn(ToolsDb, 'getQueryCallbackAsync')
            .mockResolvedValue([] as any);
        const repository = new ContractMeetingNoteRepository();

        await repository.deleteByMeetingIdInDb(55);

        expect(querySpy).toHaveBeenCalledWith(
            expect.stringContaining('DELETE FROM ContractMeetingNotes WHERE MeetingId = ?'),
            undefined,
            [55],
        );
    });

    it('passes external connection when provided', async () => {
        const fakeConn = { threadId: 42 } as any;
        const querySpy = jest
            .spyOn(ToolsDb, 'getQueryCallbackAsync')
            .mockResolvedValue([] as any);
        const repository = new ContractMeetingNoteRepository();

        await repository.deleteByMeetingIdInDb(77, fakeConn);

        expect(querySpy).toHaveBeenCalledWith(
            expect.stringContaining('DELETE FROM ContractMeetingNotes WHERE MeetingId = ?'),
            fakeConn,
            [77],
        );
    });
});

describe('ContractMeetingNoteRepository.getCreateContext', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('builds multiline relation texts from contract-only associations', async () => {
        const executeMock = jest
            .fn()
            .mockResolvedValueOnce([
                [
                    {
                        ContractId: 42,
                        ContractNumber: 'C-42',
                        ContractName: 'Contract 42',
                        ContractGdFolderId: 'contract-folder',
                        MeetingProtocolsGdFolderId: 'notes-folder',
                        ProjectGdFolderId: 'project-folder',
                    },
                ],
            ])
            .mockResolvedValueOnce([
                [
                    { Name: '  Zamawiajacy B  ' },
                    { Name: null },
                    { Name: '   ' },
                    { Name: 'Zamawiajacy A' },
                    { Name: 'Zamawiajacy A' },
                ],
            ])
            .mockResolvedValueOnce([
                [
                    { Name: ' Inzynier B ' },
                    { Name: 'Inzynier A' },
                ],
            ])
            .mockResolvedValueOnce([
                [
                    { Name: undefined },
                    { Name: ' Wykonawca A ' },
                ],
            ]);
        const repository = new ContractMeetingNoteRepository();

        const result = await repository.getCreateContext(42, {
            execute: executeMock,
        } as any);

        expect(executeMock).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining('Contracts_Entities.ContractRole = ?'),
            [42, 'EMPLOYER'],
        );
        expect(executeMock).toHaveBeenNthCalledWith(
            3,
            expect.stringContaining('Contracts_Entities.ContractRole = ?'),
            [42, 'ENGINEER'],
        );
        expect(executeMock).toHaveBeenNthCalledWith(
            4,
            expect.stringContaining('Contracts_Entities.ContractRole = ?'),
            [42, 'CONTRACTOR'],
        );
        expect(result).toEqual({
            contractId: 42,
            contractNumber: 'C-42',
            contractName: 'Contract 42',
            contractGdFolderId: 'contract-folder',
            meetingProtocolsGdFolderId: 'notes-folder',
            projectGdFolderId: 'project-folder',
            employersText: 'Zamawiajacy A\nZamawiajacy A\nZamawiajacy B',
            engineersText: 'Inzynier A\nInzynier B',
            contractorsText: 'Wykonawca A',
        });
    });

    it('returns empty strings for relation texts when no rows survive filtering', async () => {
        const executeMock = jest
            .fn()
            .mockResolvedValueOnce([
                [
                    {
                        ContractId: 7,
                        ContractNumber: 'C-7',
                        ContractName: 'Contract 7',
                        ContractGdFolderId: 'contract-folder-7',
                        MeetingProtocolsGdFolderId: null,
                        ProjectGdFolderId: null,
                    },
                ],
            ])
            .mockResolvedValueOnce([[[]][0]])
            .mockResolvedValueOnce([[{ Name: '   ' }]])
            .mockResolvedValueOnce([[{ Name: null }]]);
        const repository = new ContractMeetingNoteRepository();

        const result = await repository.getCreateContext(7, {
            execute: executeMock,
        } as any);

        expect(result).toEqual({
            contractId: 7,
            contractNumber: 'C-7',
            contractName: 'Contract 7',
            contractGdFolderId: 'contract-folder-7',
            meetingProtocolsGdFolderId: null,
            projectGdFolderId: null,
            employersText: '',
            engineersText: '',
            contractorsText: '',
        });
    });
});
