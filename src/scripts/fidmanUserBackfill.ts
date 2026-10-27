import ToolsDb from '../tools/ToolsDb';
import { loadEnv } from '../setup/loadEnv';
import PersonRepository from '../persons/PersonRepository';
import { enqueueFidmanUserPush, validateFidmanUserSource } from '../contracts/fidmanSync/FidmanSync';

/** RFS: domyślnie tylko odczyt; --apply zapisuje kolejkę, bez dostawy HTTP. */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    if (args.some((arg) => !['--apply', '--dry-run', '--prod'].includes(arg)) ||
        (args.includes('--apply') && args.includes('--dry-run'))) {
        throw new Error('Użycie: yarn ts-node src/scripts/fidmanUserBackfill.ts [--dry-run | --apply] [--prod]');
    }
    const apply = args.includes('--apply');
    loadEnv();
    const host = (process.env.DB_HOST || '').trim().toLowerCase();
    const local = host === 'localhost' || host === '127.0.0.1';
    console.log(`[RFS] DB: ${host}/${process.env.DB_NAME} (${local ? 'lokalna' : 'ZDALNA'})`);
    if (!local && !args.includes('--prod')) {
        throw new Error(`Odmowa: DB_HOST="${host}" nie jest lokalny. Uruchom z NODE_ENV=development albo podaj jawnie --prod.`);
    }
    const stats = await ToolsDb.transaction<{ total: number; skipped: number; roles: [string, number][] }>(async (conn) => {
        const [rows] = await conn.query<any[]>('SELECT PersonId FROM PersonAccounts WHERE FidmanEnabled = 1');
        const repository = new PersonRepository();
        const roles = new Map<string, number>();
        let skipped = 0;
        for (const row of rows) {
            const source = await repository.getFidmanUserSourceInConn(conn, row.PersonId);
            const problems = source ? validateFidmanUserSource(source) : ['Nie znaleziono osoby.'];
            if (!source || problems.length) {
                skipped++;
                console.log(`[RFS] PersonId=${row.PersonId}: ${problems.join(' ')}`);
                continue;
            }
            const role = source.systemRoleName ?? '(brak roli)';
            roles.set(role, (roles.get(role) ?? 0) + 1);
            if (apply) await enqueueFidmanUserPush(source, true, conn);
        }
        return { total: rows.length, skipped, roles: [...roles] };
    });
    for (const [role, count] of stats.roles) console.log(`[RFS] ${role}: ${count}`);
    console.log(`[RFS] ${apply ? 'APPLY' : 'DRY-RUN'}: osoby=${stats.total}, pominięte=${stats.skipped}. Dostawa przez drain.`);
}

main().then(() => process.exit(0)).catch((error) => {
    console.error('[RFS]', error instanceof Error ? error.message : error);
    process.exit(1);
});
