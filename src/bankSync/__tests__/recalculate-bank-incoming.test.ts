import type { PoolConnection } from 'mysql2/promise';
import type BankSyncController from '../BankSyncController';
import { runBankRecalculation, shouldApplyBankRecalculation } from '../../scripts/recalculate-bank-incoming';

function fixture(invariants = { allocationsOutsidePool: 0, overallocatedInvoices: 0, overallocatedTransfers: 0 }) {
    const conn = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn() };
    const report = { invariants } as Awaited<ReturnType<BankSyncController['recalculateIncoming']>>;
    const controller = { recalculateIncoming: jest.fn().mockResolvedValue(report) };
    return { conn, typedConn: conn as unknown as PoolConnection, report, controller };
}

test('dry run executes the same work and rolls it back without committing', async () => {
    const { conn, typedConn, report, controller } = fixture();
    await expect(runBankRecalculation(typedConn, controller)).resolves.toBe(report);
    expect(conn.beginTransaction).toHaveBeenCalledTimes(1);
    expect(controller.recalculateIncoming).toHaveBeenCalledWith(typedConn);
    expect(conn.rollback).toHaveBeenCalledTimes(1);
    expect(conn.commit).not.toHaveBeenCalled();
});

test('an explicit apply commits only when all controls pass', async () => {
    const valid = fixture();
    await runBankRecalculation(valid.typedConn, valid.controller, true);
    expect(valid.conn.commit).toHaveBeenCalledTimes(1);
    expect(valid.conn.rollback).not.toHaveBeenCalled();

    const invalid = fixture({ allocationsOutsidePool: 0, overallocatedInvoices: 1, overallocatedTransfers: 0 });
    await expect(runBankRecalculation(invalid.typedConn, invalid.controller, true)).rejects.toThrow('Naruszone niezmienniki');
    expect(invalid.conn.rollback).toHaveBeenCalledTimes(1);
    expect(invalid.conn.commit).not.toHaveBeenCalled();
});

test('production writes require two explicit flags', () => {
    expect(shouldApplyBankRecalculation([], 'production')).toBe(false);
    expect(() => shouldApplyBankRecalculation(['--apply'], 'production')).toThrow('--confirm-production');
    expect(shouldApplyBankRecalculation(['--apply', '--confirm-production'], 'production')).toBe(true);
    expect(shouldApplyBankRecalculation(['--apply'], 'development')).toBe(true);
    expect(() => shouldApplyBankRecalculation(['--aply'], 'development')).toThrow('Użycie');
});
