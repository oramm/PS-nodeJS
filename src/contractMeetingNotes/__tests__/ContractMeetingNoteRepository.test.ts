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
