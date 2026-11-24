import type { PoolConnection } from 'mysql2/promise';
import BankSyncController from '../bankSync/BankSyncController';
import { loadEnv } from '../setup/loadEnv';
import Setup from '../setup/Setup';
import ToolsDb from '../tools/ToolsDb';

export function shouldApplyBankRecalculation(args: string[], environment: string | undefined): boolean {
    const apply = args.includes('--apply');
    const confirmProduction = args.includes('--confirm-production');
    if (args.some((arg) => arg !== '--apply' && arg !== '--confirm-production')) {
        throw new Error('Użycie: recalculate-bank-incoming [--apply [--confirm-production]]');
    }
    if (confirmProduction && (!apply || environment !== 'production')) {
        throw new Error('--confirm-production dotyczy wyłącznie zapisu w NODE_ENV=production');
    }
    if (apply && environment !== 'development' && environment !== 'production') {
        throw new Error('--apply wymaga jawnego NODE_ENV=development albo production');
    }
    if (apply && environment === 'production' && !confirmProduction) {
        throw new Error('Zapis w produkcji wymaga --apply i --confirm-production');
    }
    return apply;
}

export async function runBankRecalculation(
    conn: PoolConnection,
    controller: Pick<BankSyncController, 'recalculateIncoming'>,
    apply = false,
) {
    await conn.beginTransaction();
    try {
        const report = await controller.recalculateIncoming(conn);
        if (apply) {
            if (Object.values(report.invariants).some((count) => count !== 0)) {
                throw new Error(`Naruszone niezmienniki: ${JSON.stringify(report.invariants)}`);
            }
            await conn.commit();
        } else {
            await conn.rollback();
        }
        return report;
    } catch (error) {
        await conn.rollback();
        throw error;
    }
}

async function main(): Promise<void> {
    const apply = shouldApplyBankRecalculation(process.argv.slice(2), process.env.NODE_ENV);
    const stdoutLog = console.log;
    // Stdout carries only the JSON report, including when dependencies log diagnostics.
    console.log = console.error;
    try {
        loadEnv();
        const { host, port, database } = Setup.dbConfig;
        if (!host || !database) throw new Error('DB_HOST lub DB_NAME nie jest skonfigurowane');
        console.error(`[bank-recalculate] ${apply ? 'apply' : 'dry-run'} env=${process.env.NODE_ENV ?? 'production'} db=${host}:${port ?? 3306}/${database}`);
        if (apply && process.env.NODE_ENV === 'development'
            && (!['127.0.0.1', 'localhost', '::1'].includes(host) || database !== 'envikons_local')) {
            throw new Error('Zapis w development jest dozwolony wyłącznie na lokalnej bazie envikons_local');
        }
        const pool = ToolsDb.pool;
        try {
            const conn = await pool.getConnection();
            try {
                const report = await runBankRecalculation(conn, new BankSyncController(), apply);
                const { analyzed, automatic, newlyPaid, proposals, withoutCandidate, ownTransfers } = report.counts;
                console.error(`[bank-recalculate] operacje=${analyzed} automat=${automatic} nowe Zapłacona=${newlyPaid} propozycje=${proposals} bez kandydata=${withoutCandidate} własne=${ownTransfers}`);
                process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
                if (Object.values(report.invariants).some((count) => count !== 0)) process.exitCode = 1;
            } finally {
                conn.release();
            }
        } finally {
            await pool.end();
        }
    } finally {
        console.log = stdoutLog;
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error('[bank-recalculate]', error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}
