/// <reference types="jest" />
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { app } from '../../index';
import ContractsController from '../ContractsController';
import TaskStore from '../../setup/Sessions/IntersessionsTasksStore';
import ToolsMail from '../../tools/ToolsMail';
import ChatSpacesController from '../chatSpaces/ChatSpacesController';
import MailboxController from '../../mailboxes/MailboxController';
import ContractSharedCreationController from '../milestones/sharing/ContractSharedCreationController';
import SharingError from '../milestones/sharing/MilestoneSharingError';

jest.mock('../../index', () => ({
    app: {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
    },
}));

jest.mock('../ContractsController', () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
        createContractFromDto: jest.fn(),
        addWithAuth: jest.fn(),
        editWithAuth: jest.fn(),
        deleteWithAuth: jest.fn(),
    },
}));

jest.mock('../chatSpaces/ChatSpacesController', () => ({
    __esModule: true,
    default: {
        parseSelection: jest.fn(() => ({ mode: 'none' })),
        provisionAfterContractCreation: jest.fn(),
        withMemberSync: jest.fn(async (_projects: Array<string | undefined>, work: () => Promise<unknown>) => work()),
    },
}));

jest.mock('../../mailboxes/MailboxController', () => ({
    __esModule: true,
    default: {
        parseSelection: jest.fn(() => ({ mode: 'none' })),
        validateContractSelection: jest.fn(),
        afterContract: jest.fn(async () => ({})),
    },
}));

jest.mock('../ContractsWithChildrenController', () => ({
    __esModule: true,
    default: {
        find: jest.fn(),
    },
}));

jest.mock('../ContractsSettlementController', () => ({
    __esModule: true,
    default: {
        getSums: jest.fn(),
    },
}));

jest.mock('../../ScrumSheet/ScrumSheet', () => ({
    __esModule: true,
    default: {},
}));

jest.mock('../../setup/Sessions/IntersessionsTasksStore', () => ({
    __esModule: true,
    default: {
        create: jest.fn(),
        complete: jest.fn(),
        fail: jest.fn(),
    },
}));

jest.mock('../../tools/ToolsMail', () => ({
    __esModule: true,
    default: {
        sendServerErrorReport: jest.fn(),
    },
}));

jest.mock('../milestones/sharing/ContractSharedCreationController', () => ({
    __esModule: true,
    default: { prepare: jest.fn(), addWithAuth: jest.fn() },
}));

describe('ContractsRouters', () => {
    let createHandler: any;
    let editHandler: any;

    beforeAll(() => {
        require('../ContractsRouters');
        const postMock = app.post as jest.Mock;
        const contractReactCall = postMock.mock.calls.find(
            (call) => call[0] === '/contractReact',
        );

        createHandler = contractReactCall?.[1];
        editHandler = (app.put as jest.Mock).mock.calls.find((call: any[]) => call[0] === '/contract/:id')?.[1];
    });

    beforeEach(() => {
        jest.clearAllMocks();
        (ContractSharedCreationController.prepare as any).mockReset().mockResolvedValue(undefined);
    });

    it('routes shared creation through its resumable writer', async () => {
        const contract = { id: undefined };
        (ContractSharedCreationController.prepare as any).mockResolvedValue({ contract });
        (ContractSharedCreationController.addWithAuth as any).mockResolvedValue({ contract, shortcutStatus: 'READY' });
        const request = { parsedBody: { _milestonesSelection: [
            { mode: 'shared', milestoneTypeId: 5, milestoneId: 4889, expectedRevision: 'a'.repeat(64) },
        ] } } as any;
        const response = { status: jest.fn().mockReturnThis(), send: jest.fn() } as any;
        const next = jest.fn();
        let backgroundPromise: Promise<unknown> | undefined;
        const immediate = jest.spyOn(global, 'setImmediate').mockImplementation(((callback: any) => {
            backgroundPromise = Promise.resolve().then(callback);
            return 0 as any;
        }) as typeof setImmediate);
        try {
            await createHandler(request, response, next);
            await backgroundPromise;
        } finally { immediate.mockRestore(); }
        expect(response.status).toHaveBeenCalledWith(202);
        expect(ContractSharedCreationController.addWithAuth).toHaveBeenCalled();
        expect(ContractsController.createContractFromDto).not.toHaveBeenCalled();
        expect(ContractsController.addWithAuth).not.toHaveBeenCalled();
        expect(TaskStore.complete).toHaveBeenCalledWith(expect.any(String), contract,
            expect.stringContaining('zweryfikowane przez serwer'));
        expect(next).not.toHaveBeenCalled();
    });

    it('preserves shared creation and provisions the selected Chat after it completes', async () => {
        const contract: any = { id: 77, projectOurId: 'TEST-PROJECT' };
        const selection = { mode: 'new', scope: 'contract' } as any;
        (ContractSharedCreationController.prepare as any).mockResolvedValue({ contract });
        (ContractSharedCreationController.addWithAuth as any).mockResolvedValue({ contract, shortcutStatus: 'READY' });
        (ChatSpacesController.parseSelection as any).mockReturnValue(selection);
        (ChatSpacesController.provisionAfterContractCreation as any).mockResolvedValue({ chatSpaceId: 'spaces/synthetic' });
        const req: any = { parsedBody: { _chatSpaceSelection: selection, _selectedPersonIds: [12] }, session: { userData: { enviId: 42 } } };
        const res: any = { status: jest.fn().mockReturnThis(), send: jest.fn() };
        let background: Promise<unknown> | undefined;
        const immediate = jest.spyOn(global, 'setImmediate').mockImplementation(((callback: any) => {
            background = Promise.resolve().then(callback); return 0 as any;
        }) as any);
        try { await createHandler(req, res, jest.fn()); await background; }
        finally { immediate.mockRestore(); (ChatSpacesController.parseSelection as any).mockReturnValue({ mode: 'none' }); }
        expect(ContractSharedCreationController.addWithAuth).toHaveBeenCalledTimes(1);
        expect(ContractsController.addWithAuth).not.toHaveBeenCalled();
        expect(ContractSharedCreationController.prepare).toHaveBeenCalledWith(req.parsedBody, req.session.userData, undefined, [12]);
        expect(ChatSpacesController.withMemberSync).toHaveBeenCalledWith(['TEST-PROJECT'], expect.any(Function));
        expect(MailboxController.afterContract).toHaveBeenCalledWith(77, { mode: 'none' }, 42);
        expect(ChatSpacesController.provisionAfterContractCreation).toHaveBeenCalledWith(77, selection, 42);
        expect(contract.chatSpaceId).toBe('spaces/synthetic');
        expect(TaskStore.complete).toHaveBeenCalledWith(expect.any(String), contract, expect.stringContaining('zweryfikowane przez serwer'));
        expect(TaskStore.fail).not.toHaveBeenCalled();
    });

    it('rejects a contract body ID different from the URL before creating or editing a model', async () => {
        const next = jest.fn();
        await editHandler({ params: { id: '77' }, parsedBody: { id: 88 } }, {}, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
        expect(ContractsController.createContractFromDto).not.toHaveBeenCalled();
        expect(ContractsController.editWithAuth).not.toHaveBeenCalled();
    });

    it('rejects malformed shared creation before contract setup', async () => {
        (ContractSharedCreationController.prepare as any).mockRejectedValue(new SharingError('INVALID_REQUEST', 400));
        const request = { parsedBody: { _milestonesSelection: [
            { mode: 'shared', milestoneTypeId: 5, milestoneId: 4889, expectedRevision: 'invalid' },
        ] } } as any;
        const response = { status: jest.fn().mockReturnThis(), send: jest.fn() } as any;
        const next = jest.fn();
        await createHandler(request, response, next);
        expect(response.status).toHaveBeenCalledWith(400);
        expect(response.send).toHaveBeenCalledWith(expect.objectContaining({
            error: expect.objectContaining({ code: 'INVALID_REQUEST' }),
        }));
        expect(ContractsController.createContractFromDto).not.toHaveBeenCalled();
        expect(TaskStore.create).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it('sends a server error mail when background contract creation fails', async () => {
        const contract = { id: 123 };
        const request = {
            parsedBody: { name: 'Test contract' },
            session: { userData: { userName: 'tester' } },
        } as any;
        const response = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn(),
        } as any;
        const next = jest.fn();
        const backgroundError = new Error(
            'Arkusz Scrum uszkodzony! Brak kolumny tryb',
        );

        (ContractsController.createContractFromDto as any).mockResolvedValue(
            contract,
        );
        (ContractsController.addWithAuth as any).mockRejectedValue(
            backgroundError,
        );

        let backgroundPromise: Promise<unknown> | undefined;
        const setImmediateSpy = jest
            .spyOn(global, 'setImmediate')
            .mockImplementation(((callback: (...args: any[]) => any) => {
                backgroundPromise = Promise.resolve().then(() => callback());
                return 0 as any;
            }) as typeof setImmediate);

        try {
            await createHandler(request, response, next);
            await backgroundPromise;
        } finally {
            setImmediateSpy.mockRestore();
        }

        expect(response.status).toHaveBeenCalledWith(202);
        expect(TaskStore.create).toHaveBeenCalledWith(expect.any(String));
        expect(ToolsMail.sendServerErrorReport).toHaveBeenCalledWith(
            backgroundError,
            request,
        );
        expect(TaskStore.fail).toHaveBeenCalledWith(
            expect.any(String),
            backgroundError.message,
        );
        expect(next).not.toHaveBeenCalled();
    });

    it('still fails the background task when sending the error mail fails', async () => {
        const contract = { id: 456 };
        const request = {
            parsedBody: { name: 'Fallback contract' },
            session: { userData: { userName: 'tester' } },
        } as any;
        const response = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn(),
        } as any;
        const next = jest.fn();
        const backgroundError = new Error('Background contract failure');
        const mailError = new Error('SMTP unavailable');

        (ContractsController.createContractFromDto as any).mockResolvedValue(
            contract,
        );
        (ContractsController.addWithAuth as any).mockRejectedValue(
            backgroundError,
        );
        (ToolsMail.sendServerErrorReport as any).mockRejectedValue(mailError);

        let backgroundPromise: Promise<unknown> | undefined;
        const setImmediateSpy = jest
            .spyOn(global, 'setImmediate')
            .mockImplementation(((callback: (...args: any[]) => any) => {
                backgroundPromise = Promise.resolve().then(() => callback());
                return 0 as any;
            }) as typeof setImmediate);

        const consoleErrorSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);

        try {
            await createHandler(request, response, next);
            await backgroundPromise;
        } finally {
            consoleErrorSpy.mockRestore();
            setImmediateSpy.mockRestore();
        }

        expect(response.status).toHaveBeenCalledWith(202);
        expect(ToolsMail.sendServerErrorReport).toHaveBeenCalledWith(
            backgroundError,
            request,
        );
        expect(TaskStore.fail).toHaveBeenCalledWith(
            expect.any(String),
            backgroundError.message,
        );
        expect(next).not.toHaveBeenCalled();
    });

    describe('przekazanie wyboru z drzewa struktury', () => {
        it('podaje sanityzowany wybór do addWithAuth', async () => {
            // Sama sanityzacja jest testowana przy
            // ContractTemplatesTreeController.parseSelection - tutaj sprawdzamy
            // wyłącznie, że router faktycznie ją wywołuje i przekazuje wynik.
            (ContractsController.createContractFromDto as any).mockResolvedValue(
                { id: 1 },
            );
            (ContractsController.addWithAuth as any).mockResolvedValue({ id: 1 });

            const request = {
                parsedBody: {
                    _milestonesSelection: [
                        { milestoneTypeId: 5, caseTypeIds: [1] },
                        { milestoneTypeId: 5, caseTypeIds: [2] },
                    ],
                    _contractFoldersSelection: ['MEETING_PROTOCOLS', 'PISMA'],
                },
                session: { userData: { userName: 'tester' } },
            } as any;
            const response = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn(),
            } as any;

            let backgroundPromise: Promise<unknown> | undefined;
            const setImmediateSpy = jest
                .spyOn(global, 'setImmediate')
                .mockImplementation(((callback: (...args: any[]) => any) => {
                    backgroundPromise = Promise.resolve().then(() => callback());
                    return 0 as any;
                }) as any);

            try {
                await createHandler(request, response, jest.fn());
                await backgroundPromise;
            } finally {
                setImmediateSpy.mockRestore();
            }

            const options = (ContractsController.addWithAuth as jest.Mock).mock
                .calls[0][2] as any;
            expect(options.milestonesSelection).toEqual([
                { milestoneTypeId: 5, caseTypeIds: [1, 2] },
            ]);
            expect(options.foldersSelection).toEqual(['MEETING_PROTOCOLS']);
        });
    });

    describe('pokój Google Chat przy tworzeniu kontraktu (_chatSpaceSelection)', () => {
        async function runCreate(parsedBody: any) {
            const request = {
                parsedBody,
                session: { userData: { userName: 'tester', enviId: 42 } },
            } as any;
            const response = {
                status: jest.fn().mockReturnThis(),
                send: jest.fn(),
            } as any;
            let backgroundPromise: Promise<unknown> | undefined;
            const spy = jest
                .spyOn(global, 'setImmediate')
                .mockImplementation(((callback: (...args: any[]) => any) => {
                    backgroundPromise = Promise.resolve().then(() => callback());
                    return 0 as any;
                }) as any);
            try {
                await createHandler(request, response, jest.fn());
                await backgroundPromise;
            } finally {
                spy.mockRestore();
            }
            return { request, response };
        }

        it('Chat rzuca błąd: kontrakt zostaje, zadanie kończy się sukcesem, jest log i zgłoszenie', async () => {
            const chatError = new Error('Google Chat nie założył pokoju');
            const errorSpy = jest
                .spyOn(console, 'error')
                .mockImplementation(() => undefined);
            const selection = { mode: 'new', scope: 'contract' } as any;
            (ChatSpacesController.parseSelection as any).mockReturnValue(
                selection,
            );
            (
                ChatSpacesController.provisionAfterContractCreation as any
            ).mockResolvedValue({ error: chatError });
            (ContractsController.createContractFromDto as any).mockResolvedValue(
                { id: 77 },
            );
            (ContractsController.addWithAuth as any).mockResolvedValue({
                id: 77,
            });

            const { request } = await runCreate({
                _chatSpaceSelection: selection,
            });

            expect(
                ChatSpacesController.provisionAfterContractCreation,
            ).toHaveBeenCalledWith(77, selection, 42);
            expect(TaskStore.complete).toHaveBeenCalledWith(
                expect.any(String),
                { id: 77 },
                'Kontrakt pomyślnie zarejestrowany',
            );
            expect(TaskStore.fail).not.toHaveBeenCalled();
            expect(ToolsMail.sendServerErrorReport).toHaveBeenCalledWith(
                chatError,
                request,
            );
            errorSpy.mockRestore();
            (ChatSpacesController.parseSelection as any).mockReturnValue({
                mode: 'none',
            });
        });

        it('brak pola (none): Chat w ogóle nie jest wołany', async () => {
            (ContractsController.createContractFromDto as any).mockResolvedValue(
                { id: 78 },
            );
            (ContractsController.addWithAuth as any).mockResolvedValue({
                id: 78,
            });
            await runCreate({});
            expect(
                ChatSpacesController.provisionAfterContractCreation,
            ).not.toHaveBeenCalled();
            expect(TaskStore.complete).toHaveBeenCalled();
        });
    });
});
