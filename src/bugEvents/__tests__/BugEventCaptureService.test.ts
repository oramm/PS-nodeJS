import BugEventCaptureService, { BugEventWriter } from '../BugEventCaptureService';
import { BugEventOccurrencePayload } from '../BugEvent';
import { existsSync, unlinkSync } from 'fs';
import path from 'path';

class InMemoryWriter implements BugEventWriter {
    public payloads: BugEventOccurrencePayload[] = [];

    async saveOccurrence(payload: BugEventOccurrencePayload): Promise<number> {
        this.payloads.push(payload);
        return this.payloads.length;
    }
}

describe('BugEventCaptureService', () => {
    const outboxPath = path.resolve(process.cwd(), 'tmp', 'bug-events-outbox.jsonl');

    beforeEach(() => {
        if (existsSync(outboxPath)) {
            unlinkSync(outboxPath);
        }
    });

    afterEach(() => {
        jest.restoreAllMocks();
        if (existsSync(outboxPath)) {
            unlinkSync(outboxPath);
        }
    });

    it('rate limits immediate DB writes per fingerprint and replays buffered events', async () => {
        const writer = new InMemoryWriter();
        const service = new BugEventCaptureService(writer, 60_000);

        const makeError = (id: number, line: number) => {
            const error = new Error(
                `Rate limit sample entity=${id} uuid=550e8400-e29b-41d4-a716-446655440000`
            );
            error.stack = `Error: Rate limit sample entity=${id}\n at service.call (src/service.ts:${line}:20)\n at route (src/router.ts:${line + 1}:3)`;
            return error;
        };

        const nowSpy = jest.spyOn(Date, 'now');
        nowSpy
            .mockReturnValueOnce(1_000)
            .mockReturnValueOnce(10_000)
            .mockReturnValueOnce(70_000);

        await service.captureNow({
            error: makeError(1, 10),
            source: 'express_error_middleware',
            env: 'production',
        });

        await service.captureNow({
            error: makeError(2, 20),
            source: 'express_error_middleware',
            env: 'production',
        });

        expect(writer.payloads).toHaveLength(1);

        await service.captureNow({
            error: makeError(3, 30),
            source: 'express_error_middleware',
            env: 'production',
        });

        expect(writer.payloads).toHaveLength(2);

        await service.flushPendingWindows();

        expect(writer.payloads).toHaveLength(3);
        expect(writer.payloads[0].occurrenceCount).toBe(1);
        expect(writer.payloads[1].occurrenceCount).toBe(1);
        expect(writer.payloads[2].occurrenceCount).toBe(1);
    });

    it('swallows repository failures (circuit breaker)', async () => {
        const writer: BugEventWriter = {
            saveOccurrence: jest.fn().mockRejectedValue(new Error('DB down')),
        };

        const service = new BugEventCaptureService(writer, 60_000);
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

        await expect(
            service.captureNow({
                error: new Error('Should not throw'),
                source: 'express_error_middleware',
                env: 'production',
            })
        ).resolves.toBeUndefined();

        expect(warnSpy).toHaveBeenCalled();
    });
});
