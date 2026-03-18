import BugEventRepository from './BugEventRepository';
import { BugCaptureInput, BugEventOccurrencePayload } from './BugEvent';
import { buildBugFingerprint, resolveError } from './BugFingerprint';
import { calculatePriorityScore, resolveSeverity } from './BugPriority';
import {
    appendFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    unlinkSync,
    writeFileSync,
} from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

interface FingerprintWindowState {
    lastDbWriteAt: number;
}

interface BugOutboxEntry {
    createdAt: string;
    lastError: string;
    payload: BugEventOccurrencePayload;
}

export interface BugEventWriter {
    saveOccurrence(payload: BugEventOccurrencePayload): Promise<number>;
}

export default class BugEventCaptureService {
    private static instance: BugEventCaptureService | null = null;

    private readonly repository: BugEventWriter;
    private readonly rateLimitWindowMs: number;
    private readonly fingerprintWindowState = new Map<string, FingerprintWindowState>();
    private readonly outboxFilePath = path.resolve(
        process.cwd(),
        'tmp',
        'bug-events-outbox.jsonl'
    );
    private readonly outboxProcessingFilePath = `${this.outboxFilePath}.processing`;

    constructor(repository?: BugEventWriter, rateLimitWindowMs = 60_000) {
        this.repository = repository || new BugEventRepository();
        this.rateLimitWindowMs = rateLimitWindowMs;
    }

    static getInstance(): BugEventCaptureService {
        if (!this.instance) {
            this.instance = new BugEventCaptureService();
        }
        return this.instance;
    }

    capture(input: BugCaptureInput): void {
        void this.captureNow(input);
    }

    async captureNow(input: BugCaptureInput): Promise<void> {
        const now = Date.now();
        const normalizedInput = this.normalizeInput(input);
        const snapshot = buildBugFingerprint(normalizedInput.error);
        const payload = this.makeOccurrencePayload(normalizedInput, snapshot, 1);
        const state = this.fingerprintWindowState.get(payload.fingerprint);

        if (state && now - state.lastDbWriteAt < this.rateLimitWindowMs) {
            this.persistToOutbox(payload, 'rate-limit-buffer');
            return;
        }

        const persisted = await this.persistPayload(payload);

        if (persisted) {
            this.fingerprintWindowState.set(payload.fingerprint, {
                lastDbWriteAt: now,
            });
            return;
        }

        this.fingerprintWindowState.set(payload.fingerprint, {
            lastDbWriteAt: 0,
        });
    }

    async flushPendingWindows(force = false): Promise<void> {
        await this.flushPersistentOutbox();

        if (!force) {
            return;
        }

        this.fingerprintWindowState.clear();
    }

    private async flushPersistentOutbox(): Promise<void> {
        this.recoverProcessingOutboxFile();
        if (!existsSync(this.outboxFilePath)) return;

        try {
            renameSync(this.outboxFilePath, this.outboxProcessingFilePath);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[BugEvent] Could not acquire outbox processing lock: ${message}`);
            return;
        }

        const lines = this.readOutboxLines(this.outboxProcessingFilePath);

        if (lines.length === 0) return;

        const pendingEntries: BugOutboxEntry[] = [];
        for (const line of lines) {
            let entry: BugOutboxEntry;
            try {
                entry = JSON.parse(line) as BugOutboxEntry;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`[BugEvent] Invalid outbox entry skipped: ${message}`);
                continue;
            }
            entry.payload.occurrenceCount = Math.max(
                1,
                entry.payload.occurrenceCount
            );
            pendingEntries.push(entry);
        }

        const remainingEntries: BugOutboxEntry[] = [];

        try {
            for (const entry of pendingEntries) {
                try {
                    await this.repository.saveOccurrence(entry.payload);
                } catch (error) {
                    const message =
                        error instanceof Error ? error.message : String(error);
                    remainingEntries.push({
                        ...entry,
                        lastError: message,
                    });
                }
            }
        } finally {
            this.commitOutboxProcessingResult(remainingEntries);
        }
    }

    private recoverProcessingOutboxFile(): void {
        if (!existsSync(this.outboxProcessingFilePath)) return;

        const staleLines = this.readOutboxLines(this.outboxProcessingFilePath);
        if (staleLines.length === 0) {
            unlinkSync(this.outboxProcessingFilePath);
            return;
        }

        const existingLines = this.readOutboxLines(this.outboxFilePath);
        const merged = [...staleLines, ...existingLines];
        this.writeOutboxLines(this.outboxFilePath, merged);
        unlinkSync(this.outboxProcessingFilePath);
    }

    private commitOutboxProcessingResult(remainingEntries: BugOutboxEntry[]): void {
        const processingLines = remainingEntries.map((entry) => JSON.stringify(entry));
        const newOutboxLines = this.readOutboxLines(this.outboxFilePath);
        const merged = [...processingLines, ...newOutboxLines];

        this.writeOutboxLines(this.outboxFilePath, merged);

        if (existsSync(this.outboxProcessingFilePath)) {
            unlinkSync(this.outboxProcessingFilePath);
        }
    }

    private readOutboxLines(filePath: string): string[] {
        if (!existsSync(filePath)) return [];
        const raw = readFileSync(filePath, 'utf8');
        return raw
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
    }

    private writeOutboxLines(filePath: string, lines: string[]): void {
        const serialized = lines.length > 0 ? `${lines.join('\n')}\n` : '';
        writeFileSync(filePath, serialized, 'utf8');
    }

    private normalizeInput(input: BugCaptureInput): BugCaptureInput {
        return {
            ...input,
            error: resolveError(input.error),
            tags: input.tags ? [...input.tags] : undefined,
            requestContext: input.requestContext
                ? { ...input.requestContext }
                : undefined,
            userContext: input.userContext ? { ...input.userContext } : undefined,
        };
    }

    private persistToOutbox(
        payload: BugEventOccurrencePayload,
        lastError: string
    ): void {
        try {
            mkdirSync(path.dirname(this.outboxFilePath), { recursive: true });
            const entry: BugOutboxEntry = {
                createdAt: new Date().toISOString(),
                lastError,
                payload,
            };
            appendFileSync(this.outboxFilePath, `${JSON.stringify(entry)}\n`, 'utf8');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[BugEvent] Failed to write outbox fallback: ${message}`);
        }
    }

    private makeOccurrencePayload(
        input: BugCaptureInput,
        snapshot: {
            fingerprint: string;
            rawMessage: string;
            rawStack?: string;
        },
        occurrenceCount: number
    ): BugEventOccurrencePayload {
        const resolved = resolveError(input.error);
        const severity = resolveSeverity({
            source: input.source,
            env: input.env,
            message: resolved.message,
        });

        const priorityScore = calculatePriorityScore({
            occurrenceCount,
            env: input.env,
            source: input.source,
            severity,
            requestContext: input.requestContext,
        });

        return {
            occurrenceKey: randomUUID(),
            fingerprint: snapshot.fingerprint,
            severity,
            source: input.source,
            message: snapshot.rawMessage,
            stack: snapshot.rawStack,
            requestContext: input.requestContext,
            userContext: input.userContext,
            env: input.env,
            tags: input.tags,
            priorityScore,
            occurrenceCount,
        };
    }

    private async persistPayload(
        payload: BugEventOccurrencePayload
    ): Promise<boolean> {

        try {
            await this.repository.saveOccurrence(payload);
            return true;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(
                `[BugEvent] Capture persistence failed (circuit breaker): ${message}`
            );
            this.persistToOutbox(payload, message);
            return false;
        }
    }
}
