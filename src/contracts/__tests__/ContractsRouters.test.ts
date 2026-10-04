/// <reference types="jest" />
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { app } from '../../index';
import ContractsController from '../ContractsController';
import TaskStore from '../../setup/Sessions/IntersessionsTasksStore';
import ToolsMail from '../../tools/ToolsMail';
import ChatSpacesController from '../chatSpaces/ChatSpacesController';

jest.mock('../../index', () => ({
    app: {
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

describe('ContractsRouters', () => {
    let createHandler: any;

    beforeAll(() => {
        require('../ContractsRouters');
        const postMock = app.post as jest.Mock;
        const contractReactCall = postMock.mock.calls.find(
            (call) => call[0] === '/contractReact',
        );

        createHandler = contractReactCall?.[1];
    });

    beforeEach(() => {
        jest.clearAllMocks();
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
