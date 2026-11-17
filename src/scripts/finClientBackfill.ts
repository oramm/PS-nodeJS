import { loadEnv } from '../setup/loadEnv';
import Setup from '../setup/Setup';
import ToolsDb from '../tools/ToolsDb';
import { enqueueFinEntityRefresh, findFinClientIds } from '../contracts/fidmanSync/FidmanSync';

/** Domyślnie tylko liczba i próbka; --apply zapisuje outbox, bez HTTP. */
export async function main(args = process.argv.slice(2)): Promise<void> {
    if (args.some((arg) => !['--apply', '--dry-run', '--prod'].includes(arg)) ||
        (args.includes('--apply') && args.includes('--dry-run'))) {
        throw new Error('Użycie: yarn ts-node src/scripts/finClientBackfill.ts [--dry-run | --apply] [--prod]');
    }
    loadEnv();
    const apply = args.includes('--apply');
    if (apply && (!Setup.FinSync.baseUrl || !Setup.FinSync.token)) {
        throw new Error('[FIN] Wymagane FIN_SYNC_BASE_URL i FIN_SYNC_TOKEN dla backfillu FIN.');
    }
    const host = (process.env.DB_HOST || '').trim().toLowerCase();
    const local = host === 'localhost' || host === '127.0.0.1';
    console.log(`[FIN] DB: ${host}/${process.env.DB_NAME} (${local ? 'lokalna' : 'ZDALNA'})`);
    if (!local && !args.includes('--prod')) {
        throw new Error(`Odmowa: DB_HOST="${host}" nie jest lokalny. Uruchom z NODE_ENV=development albo podaj jawnie --prod.`);
    }
    await ToolsDb.transaction(async (conn) => {
        const ids = await findFinClientIds(conn);
        console.log(`[FIN] ${apply ? 'APPLY' : 'DRY-RUN'}: liczba=${ids.length}, próbka=${ids.slice(0, 10).join(', ')}.`);
        if (apply) for (const id of ids) await enqueueFinEntityRefresh(conn, id);
    });
}

if (require.main === module) main().then(() => process.exit(0)).catch((error) => {
    console.error('[FIN]', error instanceof Error ? error.message : error);
    process.exit(1);
});
