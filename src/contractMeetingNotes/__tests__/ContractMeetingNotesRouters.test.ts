import { app } from '../../index';
import ContractMeetingNotesController from '../ContractMeetingNotesController';
import ContractMeetingNoteValidator from '../ContractMeetingNoteValidator';

jest.mock('../../index', () => ({
    app: {
        post: jest.fn(),
    },
}));

jest.mock('../ContractMeetingNotesController', () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
        addFromDto: jest.fn(),
    },
}));

jest.mock('../ContractMeetingNoteValidator', () => ({
    __esModule: true,
    default: {
        validateFindPayload: jest.fn(),
        validateCreatePayload: jest.fn(),
    },
}));

describe('ContractMeetingNotesRouters', () => {
    let readHandler: any;
    let createHandler: any;

    beforeAll(() => {
        require('../ContractMeetingNotesRouters');
        const postMock = app.post as jest.Mock;

        readHandler = postMock.mock.calls.find(
            ([path]: [string]) => path === '/contractMeetingNotes'
        )?.[1];
        createHandler = postMock.mock.calls.find(
            ([path]: [string]) => path === '/contractMeetingNote'
        )?.[1];
    });

    beforeEach(() => {
        (ContractMeetingNoteValidator.validateFindPayload as jest.Mock).mockReset();
        (ContractMeetingNoteValidator.validateCreatePayload as jest.Mock).mockReset();
        (ContractMeetingNotesController.find as jest.Mock).mockReset();
        (ContractMeetingNotesController.addFromDto as jest.Mock).mockReset();
    });

    it('filters by contractId via body.orConditions for POST /contractMeetingNotes', async () => {
        const req = {
            parsedBody: { orConditions: [{ contractId: 123 }] },
            body: {},
        } as any;
        const res = { send: jest.fn() } as any;
        const next = jest.fn();
        const expected = [{ id: 1, contractId: 123 }];

        (ContractMeetingNoteValidator.validateFindPayload as jest.Mock).mockReturnValue(
            req.parsedBody
        );
        (ContractMeetingNotesController.find as jest.Mock).mockResolvedValue(
            expected
        );

        await readHandler(req, res, next);

        expect(ContractMeetingNoteValidator.validateFindPayload).toHaveBeenCalledWith(
            req.parsedBody
        );
        expect(ContractMeetingNotesController.find).toHaveBeenCalledWith([
            { contractId: 123 },
        ]);
        expect(res.send).toHaveBeenCalledWith(expected);
        expect(next).not.toHaveBeenCalled();
    });

    it('keeps create endpoint behavior for POST /contractMeetingNote', async () => {
        const createPayload = {
            contractId: 5,
            title: 'Weekly sync',
            description: null,
            meetingDate: null,
            createdByPersonId: null,
        };
        const req = {
            parsedBody: createPayload,
            body: {},
            session: { userData: { enviId: 77 } },
        } as any;
        const res = { send: jest.fn() } as any;
        const next = jest.fn();
        const created = { id: 15, ...createPayload };

        (
            ContractMeetingNoteValidator.validateCreatePayload as jest.Mock
        ).mockReturnValue(createPayload);
        (ContractMeetingNotesController.addFromDto as jest.Mock).mockResolvedValue(
            created
        );

        await createHandler(req, res, next);

        expect(
            ContractMeetingNoteValidator.validateCreatePayload
        ).toHaveBeenCalledWith(createPayload);
        expect(ContractMeetingNotesController.addFromDto).toHaveBeenCalledWith(
            createPayload,
            77
        );
        expect(res.send).toHaveBeenCalledWith(created);
        expect(next).not.toHaveBeenCalled();
    });
});
