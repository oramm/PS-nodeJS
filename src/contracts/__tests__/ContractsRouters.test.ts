/// <reference types="jest" />
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { app } from '../../index';
import ContractsController from '../ContractsController';
import TaskStore from '../../setup/Sessions/IntersessionsTasksStore';
import ToolsMail from '../../tools/ToolsMail';

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
});
