/**
 * SYNC-P3 — DB-free tests for getFidmanNipGapReport() ("awizowanie braków").
 *
 * Mocks ToolsDb.getQueryCallbackAsync to return the two result sets the function
 * issues (party-entity rows, then NEEDS_DATA contract rows) and asserts:
 *  (a) entities with a valid NIP (checksum) are excluded from the report even if
 *      they are a party of a synced-type contract — only real gaps are listed;
 *  (b) an entity that is a party on >1 contract is reported ONCE with all
 *      contractIds collected (distinct-entity dedup, matches the B1 audit's
 *      "distinct entities" framing, not a per-role row count);
 *  (c) the fixture mirrors the real 2026-07-11 B1 gap set (contracts 224, 436,
 *      493, 684, 1268, 1753, 1823 -> 6 distinct entities incl. entity 85 twice)
 *      plus the NEEDS_DATA contracts (227, 237, 293, 494);
 *  (d) each row carries reason + reasonLabel via the P2 fidmanSkipReasonLabel
 *      helper (reused, not re-implemented);
 *  (e) empty type allowlist -> no query issued, empty report.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../tools/ToolsDb');

import ToolsDb from '../../../tools/ToolsDb';
import { getFidmanNipGapReport, fidmanSkipReasonLabel } from '../FidmanSync';

describe('getFidmanNipGapReport (SYNC-P3 gap list)', () => {
    beforeEach(() => {
        (ToolsDb.getQueryCallbackAsync as jest.Mock).mockReset();
    });

    it('mirrors the 2026-07-11 B1 gap set: 6 distinct NO_NIP entities + 4 NEEDS_DATA contracts', async () => {
        // First call: Contracts_Entities join rows for synced-type, non-Archiwalny contracts.
        (ToolsDb.getQueryCallbackAsync as any)
            .mockResolvedValueOnce([
                { entityId: 5, name: 'ATA - TECHNIK', taxNumber: null, contractId: 224 },
                { entityId: 41, name: 'JS Architekci', taxNumber: null, contractId: 436 },
                {
                    entityId: 33,
                    name: 'Gmina Ścinawa',
                    taxNumber: '6922261396', // valid NIP, same contract as 41 -> must NOT appear
                    contractId: 436,
                },
                {
                    entityId: 332,
                    name: 'PGKiM Antoniów',
                    taxNumber: null,
                    contractId: 493,
                },
                {
                    entityId: 85,
                    name: 'WINSAN',
                    taxNumber: null,
                    contractId: 684,
                },
                {
                    entityId: 85,
                    name: 'WINSAN',
                    taxNumber: null,
                    contractId: 1823, // same entity, 2nd synced contract -> dedup
                },
                {
                    entityId: 620,
                    name: 'Adamietz Sp. z o.o.',
                    taxNumber: null,
                    contractId: 1268,
                },
                {
                    entityId: 601,
                    name: 'ESIX Sp. z o.o',
                    taxNumber: null,
                    contractId: 1753,
                },
            ])
            // Second call: NEEDS_DATA contract rows.
            .mockResolvedValueOnce([
                { contractId: 227, number: 'Zad. 03', name: 'Kanalizacja Opolska' },
                { contractId: 237, number: 'Zad. 17 (17.2)', name: 'Oczyszczalnia' },
                { contractId: 293, number: 'Zad. 11', name: 'Kanalizacja Klonowa' },
                { contractId: 494, number: 'Zad. 08, 10', name: 'Kanalizacja Chopina' },
            ]);

        const report = await getFidmanNipGapReport();

        expect(report.noNip).toHaveLength(6);
        const byId = new Map(report.noNip.map((e) => [e.entityId, e]));
        expect([...byId.keys()].sort((a, b) => a - b)).toEqual([
            5, 41, 85, 332, 601, 620,
        ]);
        // valid-NIP entity 33 never makes it into the report.
        expect(byId.has(33)).toBe(false);
        // entity 85 collected both contracts it is a party of (dedup, not 2 rows).
        expect(byId.get(85)?.contractIds).toEqual([684, 1823]);
        expect(byId.get(5)?.contractIds).toEqual([224]);
        expect(byId.get(5)?.reason).toBe('NO_NIP');
        expect(byId.get(5)?.reasonLabel).toBe(fidmanSkipReasonLabel('NO_NIP'));

        expect(report.needsData).toHaveLength(4);
        expect(report.needsData.map((c) => c.contractId).sort((a, b) => a - b)).toEqual([
            227, 237, 293, 494,
        ]);
        expect(report.needsData[0].reason).toBe('NEEDS_DATA');
        expect(report.needsData[0].reasonLabel).toBe(
            fidmanSkipReasonLabel('NEEDS_DATA')
        );
    });

    it('malformed-but-non-null NIP (e.g. too short) is still reported as a gap', async () => {
        (ToolsDb.getQueryCallbackAsync as any)
            .mockResolvedValueOnce([
                { entityId: 9, name: 'Bad Nip Co', taxNumber: '123', contractId: 999 },
            ])
            .mockResolvedValueOnce([]);

        const report = await getFidmanNipGapReport();
        expect(report.noNip).toHaveLength(1);
        expect(report.noNip[0].entityId).toBe(9);
    });

    it('formatted-but-valid NIP (dashes/spaces) is normalized and excluded', async () => {
        (ToolsDb.getQueryCallbackAsync as any)
            .mockResolvedValueOnce([
                {
                    entityId: 331,
                    name: 'ZUK Jaworzyna',
                    taxNumber: '884-000-79-13', // passes checksum once normalized
                    contractId: 684,
                },
            ])
            .mockResolvedValueOnce([]);

        const report = await getFidmanNipGapReport();
        expect(report.noNip).toHaveLength(0);
    });

    it('empty type allowlist -> no query issued, empty report', async () => {
        const ORIG = process.env.FIDMAN_SYNC_CONTRACT_TYPE_IDS;
        process.env.FIDMAN_SYNC_CONTRACT_TYPE_IDS = '';
        try {
            const report = await getFidmanNipGapReport();
            expect(report).toEqual({ noNip: [], needsData: [] });
            expect(ToolsDb.getQueryCallbackAsync).not.toHaveBeenCalled();
        } finally {
            if (ORIG === undefined) delete process.env.FIDMAN_SYNC_CONTRACT_TYPE_IDS;
            else process.env.FIDMAN_SYNC_CONTRACT_TYPE_IDS = ORIG;
        }
    });
});
