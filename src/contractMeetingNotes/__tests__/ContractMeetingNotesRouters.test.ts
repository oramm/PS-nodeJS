import { app } from '../../index';
import ContractMeetingNotesController from '../ContractMeetingNotesController';

jest.mock('../../index', () => ({
    app: {
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
    },
}));

jest.mock('../ContractMeetingNotesController', () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
        findFromDto: jest.fn(),
        addFromDto: jest.fn(),
        editFromDto: jest.fn(),
        deleteById: jest.fn(),
    },
}));

describe('ContractMeetingNotesRouters', () => {
    let readHandler: any;
    let createHandler: any;

    beforeAll(() => {
        require('../ContractMeetingNotesRouters');
        const postMock = app.post as jest.Mock;

        readHandler = postMock.mock.calls.find(
            ([path]: [string]) => path === '/contractMeetingNotes',
        )?.[1];
        createHandler = postMock.mock.calls.find(
            ([path]: [string]) => path === '/contractMeetingNote',
        )?.[1];
    });

    beforeEach(() => {
        (ContractMeetingNotesController.find as jest.Mock).mockReset();
        (ContractMeetingNotesController.findFromDto as jest.Mock).mockReset();
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

        (
            ContractMeetingNotesController.findFromDto as jest.Mock
        ).mockResolvedValue(expected);

        await readHandler(req, res, next);

        expect(ContractMeetingNotesController.findFromDto).toHaveBeenCalledWith(
            req.parsedBody,
        );
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
            ContractMeetingNotesController.addFromDto as jest.Mock
        ).mockResolvedValue(created);

        await createHandler(req, res, next);

        expect(ContractMeetingNotesController.addFromDto).toHaveBeenCalledWith(
            createPayload,
            77,
        );
        expect(res.send).toHaveBeenCalledWith(created);
        expect(next).not.toHaveBeenCalled();
    });
});
