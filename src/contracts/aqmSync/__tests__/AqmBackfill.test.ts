/**
 * WS10 / N5 — DB-free tests for the AQM backfill (Task C).
 *
 * Coverage:
 *  - isValidNipChecksum (O2): real fixtures valid/invalid + all-zeros guard
 *  - dry-run: counts qualify / would-push / skip (0-emp, >1-emp, bad-NIP) and
 *    WRITES NOTHING (no transaction, no enqueue)
 *  - apply: enqueues only qualifying contracts
 *  - apply idempotency: a re-run (existing-outbox dedup) creates 0 new PENDING
 *    rows for the same ContractId; in-batch duplicate ContractIds also deduped
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../tools/ToolsDb');

import { isValidNipChecksum } from '../AqmSync';
import { runBackfill, BackfillPorts } from '../backfill';

// Real NIPs that pass the O2 checksum (from the decision-record verification).
const VALID_NIP = '5260250995';
const VALID_NIP_FORMATTED = '526-025-09-95';
const VALID_NIP_2 = '1234563218';
const BAD_NIP = '1234567890'; // fails checksum

const employer = (id: number, taxNumber: string) => ({
    id,
    name: `Org ${id}`,
    taxNumber,
    address: 'ul. Wodna 1',
});

const contract = (id: number, employers: any[], typeId = 10) => ({
    id,
    typeId,
    startDate: '2026-06-01',
    endDate: '2027-05-31',
    gdFolderId: `FOLDER_${id}`,
    _employers: employers,
});

describe('isValidNipChecksum (O2)', () => {
    it('accepts valid NIPs incl. formatted input', () => {
        expect(isValidNipChecksum(VALID_NIP)).toBe(true);
        expect(isValidNipChecksum(VALID_NIP_FORMATTED)).toBe(true);
        expect(isValidNipChecksum(VALID_NIP_2)).toBe(true);
        expect(isValidNipChecksum('7740001454')).toBe(true);
    });
    it('rejects bad checksum, wrong length, and all-zeros', () => {
        expect(isValidNipChecksum(BAD_NIP)).toBe(false);
        expect(isValidNipChecksum('123')).toBe(false);
        expect(isValidNipChecksum('0000000000')).toBe(false);
        expect(isValidNipChecksum(undefined)).toBe(false);
        expect(isValidNipChecksum(null)).toBe(false);
    });
});

function mkPorts(
    contracts: any[],
    alreadyEnqueued: number[] = []
): BackfillPorts & {
    enqueueSpy: jest.Mock;
    txSpy: jest.Mock;
} {
    const enqueueSpy = jest.fn<any>();
    const txSpy = jest.fn<any>(async (fn: any) => {
        // Simulate a connection; record each enqueue call by contract id.
        const conn: any = {
            execute: jest
                .fn<any>()
                .mockResolvedValue([{ insertId: 1 }, undefined]),
        };
        enqueueSpy(conn);
        return fn(conn);
    });
    return {
        loadAqmContracts: async () => contracts,
        loadEnqueuedContractIds: async () => new Set(alreadyEnqueued),
        withTransaction: txSpy as any,
        enqueueSpy,
        txSpy,
    };
}

describe('runBackfill — dry-run (writes nothing)', () => {
    let ports: ReturnType<typeof mkPorts>;

    beforeEach(() => {
        ports = mkPorts([
            contract(1, [employer(11, VALID_NIP)]), // qualify
            contract(2, [employer(21, VALID_NIP_FORMATTED)]), // qualify
            contract(3, []), // skip NO_EMPLOYER (the legacy 58)
            contract(4, [employer(41, VALID_NIP), employer(42, VALID_NIP_2)]), // skip MULTIPLE_EMPLOYERS
            contract(5, [employer(51, BAD_NIP)]), // skip BAD_NIP
        ]);
    });

    it('counts qualify / would-push / skip by reason and writes nothing', async () => {
        const report = await runBackfill(ports, { apply: false });

        expect(report.mode).toBe('dry-run');
        expect(report.total).toBe(5);
        expect(report.qualify).toBe(2);
        expect(report.wouldPush).toBe(2);
        expect(report.skipped).toBe(3);
        expect(report.skippedByReason).toEqual({
            NO_EMPLOYER: 1,
            MULTIPLE_EMPLOYERS: 1,
            BAD_NIP: 1,
        });
        expect(report.enqueued).toBe(0);

        // Absolutely no writes in dry-run.
        expect(ports.txSpy).not.toHaveBeenCalled();
        expect(ports.enqueueSpy).not.toHaveBeenCalled();
    });
});

describe('runBackfill — apply', () => {
    it('enqueues only qualifying contracts', async () => {
        const ports = mkPorts([
            contract(1, [employer(11, VALID_NIP)]), // qualify -> enqueue
            contract(3, []), // skip
            contract(5, [employer(51, BAD_NIP)]), // skip
            contract(7, [employer(71, VALID_NIP_2)]), // qualify -> enqueue
        ]);

        const report = await runBackfill(ports, { apply: true });

        expect(report.mode).toBe('apply');
        expect(report.qualify).toBe(2);
        expect(report.enqueued).toBe(2);
        expect(report.alreadyEnqueued).toBe(0);
        expect(report.skipped).toBe(2);
        // Exactly one transaction per qualifying contract.
        expect(ports.txSpy).toHaveBeenCalledTimes(2);
    });

    it('is idempotent on re-run: skips already-enqueued ContractIds (0 new PENDING)', async () => {
        const contracts = [
            contract(1, [employer(11, VALID_NIP)]),
            contract(7, [employer(71, VALID_NIP_2)]),
        ];
        // Simulate that both already have a PENDING/SENT outbox row.
        const ports = mkPorts(contracts, [1, 7]);

        const report = await runBackfill(ports, { apply: true });

        expect(report.qualify).toBe(2);
        expect(report.enqueued).toBe(0); // no duplicate PENDING rows
        expect(report.alreadyEnqueued).toBe(2);
        expect(ports.txSpy).not.toHaveBeenCalled();
    });

    it('enqueues a never-seen contract while deduping an already-enqueued one', async () => {
        const contracts = [
            contract(1, [employer(11, VALID_NIP)]), // already enqueued
            contract(9, [employer(91, VALID_NIP_2)]), // new -> enqueue
        ];
        const ports = mkPorts(contracts, [1]);

        const report = await runBackfill(ports, { apply: true });

        expect(report.enqueued).toBe(1);
        expect(report.alreadyEnqueued).toBe(1);
        expect(ports.txSpy).toHaveBeenCalledTimes(1);
    });

    it('dedups in-batch duplicate ContractIds within a single apply run', async () => {
        // Same ContractId twice in the loaded set (defensive) — only one push.
        const contracts = [
            contract(1, [employer(11, VALID_NIP)]),
            contract(1, [employer(11, VALID_NIP)]),
        ];
        const ports = mkPorts(contracts, []);

        const report = await runBackfill(ports, { apply: true });

        expect(report.enqueued).toBe(1);
        expect(report.alreadyEnqueued).toBe(1);
        expect(ports.txSpy).toHaveBeenCalledTimes(1);
    });
});
