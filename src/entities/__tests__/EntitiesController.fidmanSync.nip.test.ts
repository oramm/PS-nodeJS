/**
 * SYNC-P3 — NIP validation guard on EntitiesController.editEntity() for entities
 * that are already a party of a synced-type (FIDman) contract, plus the re-push
 * linking path once a NIP is filled in.
 *
 * DB-free, same mocking style as EntitiesController.fidmanSync.test.ts (P1): a
 * ToolsDb.transaction mock that emulates begin/commit/rollback, and FidmanSync
 * mocked so the guard/enqueue calls are observable.
 *
 * Guarantees under test (each red-without-fix, see the manual guard-removal
 * check recorded in the session report):
 *  1. sync-party entity + missing/invalid NIP -> editEntity REJECTS, business
 *     write rolled back, no enqueue, no delivery.
 *  2. sync-party entity + valid NIP -> editEntity succeeds, enqueue happens
 *     with the Entity object carrying the new taxNumber (linking path).
 *  3. non-sync-party entity + missing/invalid NIP -> editEntity still succeeds
 *     unchanged (guard must not touch entities that are not a sync party).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../tools/ToolsDb');
jest.mock('../../contracts/fidmanSync/FidmanSync');

import ToolsDb from '../../tools/ToolsDb';
import * as FidmanSync from '../../contracts/fidmanSync/FidmanSync';
import EntitiesController from '../EntitiesController';

describe('EntitiesController.editEntity() — SYNC-P3 NIP guard', () => {
    let mockConn: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockConn = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
        };

        (ToolsDb.transaction as jest.Mock).mockImplementation(
            async (cb: any) => {
                await mockConn.beginTransaction();
                try {
                    const result = await cb(mockConn);
                    await mockConn.commit();
                    return result;
                } catch (e) {
                    await mockConn.rollback();
                    throw e;
                }
            }
        );
        (ToolsDb.editInDb as any).mockResolvedValue(undefined);
    });

    it('sync-party entity WITHOUT NIP -> rejected, rolled back, no enqueue', async () => {
        (FidmanSync.entityHasSyncedContract as any).mockResolvedValue(true);

        await expect(
            EntitiesController.edit({ id: 5, name: 'ATA - TECHNIK' } as any)
        ).rejects.toThrow(/NIP/);

        expect(mockConn.rollback).toHaveBeenCalledTimes(1);
        expect(mockConn.commit).not.toHaveBeenCalled();
        expect(ToolsDb.editInDb).not.toHaveBeenCalled();
        expect(FidmanSync.enqueueFidmanEntityPush).not.toHaveBeenCalled();
        expect(FidmanSync.tryDeliverAfterCommit).not.toHaveBeenCalled();
    });

    it('sync-party entity with a malformed NIP (bad checksum) -> rejected', async () => {
        (FidmanSync.entityHasSyncedContract as any).mockResolvedValue(true);

        await expect(
            EntitiesController.edit({
                id: 5,
                name: 'ATA - TECHNIK',
                taxNumber: '1234567890', // 10 digits, fails mod-11 checksum
            } as any)
        ).rejects.toThrow(/NIP/);

        expect(mockConn.rollback).toHaveBeenCalledTimes(1);
        expect(FidmanSync.enqueueFidmanEntityPush).not.toHaveBeenCalled();
    });

    it('sync-party entity: NIP filled in with a VALID value -> saved + enqueued with taxNumber populated (linking path)', async () => {
        (FidmanSync.entityHasSyncedContract as any).mockResolvedValue(true);
        let pushedEntity: any;
        (FidmanSync.enqueueFidmanEntityPush as any).mockImplementation(
            async (entity: any) => {
                pushedEntity = entity;
                return 42;
            }
        );
        (FidmanSync.tryDeliverAfterCommit as any).mockResolvedValue(undefined);

        const result = await EntitiesController.edit({
            id: 5,
            name: 'ATA - TECHNIK',
            taxNumber: '7471917575', // valid mod-11 NIP
        } as any);

        expect(result).toBeDefined();
        expect(mockConn.commit).toHaveBeenCalledTimes(1);
        expect(mockConn.rollback).not.toHaveBeenCalled();
        expect(ToolsDb.editInDb).toHaveBeenCalledTimes(1);
        expect(FidmanSync.enqueueFidmanEntityPush).toHaveBeenCalledTimes(1);
        // The re-push path enqueues the SAME entity object -> taxNumber is populated,
        // which is what lets FIDman dedup by legacy_id -> NIP and link the party.
        expect(pushedEntity.taxNumber).toBe('7471917575');
        expect(FidmanSync.tryDeliverAfterCommit).toHaveBeenCalledWith(42);
    });

    it('NOT a sync party + missing NIP -> editEntity still succeeds unchanged', async () => {
        (FidmanSync.entityHasSyncedContract as any).mockResolvedValue(false);

        const result = await EntitiesController.edit({
            id: 999,
            name: 'Foreign Co (no PL NIP)',
        } as any);

        expect(result).toBeDefined();
        expect(mockConn.commit).toHaveBeenCalledTimes(1);
        expect(mockConn.rollback).not.toHaveBeenCalled();
        expect(ToolsDb.editInDb).toHaveBeenCalledTimes(1);
        expect(FidmanSync.enqueueFidmanEntityPush).not.toHaveBeenCalled();
    });

    it('NOT a sync party + malformed NIP -> editEntity still succeeds unchanged (no format requirement for non-parties)', async () => {
        (FidmanSync.entityHasSyncedContract as any).mockResolvedValue(false);

        const result = await EntitiesController.edit({
            id: 999,
            name: 'Foreign Co',
            taxNumber: 'FR-123-XYZ',
        } as any);

        expect(result).toBeDefined();
        expect(mockConn.commit).toHaveBeenCalledTimes(1);
        expect(mockConn.rollback).not.toHaveBeenCalled();
    });
});
