export interface ProcessErrorCaptureService {
    capture(input: {
        error: unknown;
        source:
            | 'process_uncaught_exception'
            | 'process_unhandled_rejection';
        env: string;
    }): void;
}

export interface ProcessErrorHandlerDependencies {
    bugEventCaptureService: ProcessErrorCaptureService;
    env: string;
    sendServerErrorReport(error: unknown): Promise<unknown> | void;
}

export function handleUncaughtException(
    dependencies: ProcessErrorHandlerDependencies,
    err: unknown,
): void {
    console.error('Wystąpił nieobsłużony wyjątek:', err);
    dependencies.bugEventCaptureService.capture({
        error: err,
        source: 'process_uncaught_exception',
        env: dependencies.env,
    });
    void dependencies.sendServerErrorReport(err);
}

export function handleUnhandledRejection(
    dependencies: ProcessErrorHandlerDependencies,
    reason: unknown,
    promise: Promise<unknown>,
): void {
    console.error(
        'Nieobsłużone odrzucenie Promise:',
        promise,
        'powód:',
        reason,
    );
    dependencies.bugEventCaptureService.capture({
        error: reason,
        source: 'process_unhandled_rejection',
        env: dependencies.env,
    });
    void dependencies.sendServerErrorReport(reason);
}