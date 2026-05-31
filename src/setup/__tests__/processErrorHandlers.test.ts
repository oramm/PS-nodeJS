import { describe, expect, it, jest } from '@jest/globals';
import {
    handleUnhandledRejection,
    ProcessErrorHandlerDependencies,
} from '../processErrorHandlers';

describe('processErrorHandlers', () => {
    const makeDependencies = (): {
        dependencies: ProcessErrorHandlerDependencies;
        capture: jest.Mock;
        sendServerErrorReport: jest.Mock;
    } => {
        const capture = jest.fn((_input) => undefined);
        const sendServerErrorReport = jest.fn((_error: unknown) => undefined);

        return {
            dependencies: {
                bugEventCaptureService: {
                    capture,
                },
                env: 'test',
                sendServerErrorReport,
            },
            capture,
            sendServerErrorReport,
        };
    };

    it('sends a server error email for unhandled rejections', () => {
        const { dependencies, capture, sendServerErrorReport } =
            makeDependencies();
        const reason = new Error('Mail me on unhandled rejection');
        const promise = Promise.resolve();
        const consoleErrorSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => undefined);

        try {
            handleUnhandledRejection(dependencies, reason, promise);
        } finally {
            consoleErrorSpy.mockRestore();
        }

        expect(capture).toHaveBeenCalledWith({
            error: reason,
            source: 'process_unhandled_rejection',
            env: 'test',
        });
        expect(sendServerErrorReport).toHaveBeenCalledWith(reason);
    });
});