import ToolsDb from '../tools/ToolsDb';
import { loadEnv } from '../setup/loadEnv';
import {
    buildContractPersonnelPayload,
    enqueueFidmanPersonnelPush,
    findFidmanPersonnelContracts,
} from '../contracts/fidmanSync/FidmanSync';

/** WNM-2: domyślnie tylko odczyt; --apply zapisuje kolejkę, bez dostawy HTTP. */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    if (args.some((arg) => !['--apply', '--dry-run', '--prod'].includes(arg)) ||
        (args.includes('--apply') && args.includes('--dry-run'))) {
        throw new Error('Użycie: yarn ts-node src/scripts/fidmanPersonnelBackfill.ts [--dry-run | --apply] [--prod]');
    }
    const apply = args.includes('--apply');
    loadEnv();
    const host = (process.env.DB_HOST || '').trim().toLowerCase();
    const local = host === 'localhost' || host === '127.0.0.1';
    console.log(`[WNM-2] DB: ${host}/${process.env.DB_NAME} (${local ? 'lokalna' : 'ZDALNA'})`);
    if (!local && !args.includes('--prod')) {
        throw new Error(`Odmowa: DB_HOST="${host}" nie jest lokalny. Uruchom z NODE_ENV=development albo podaj jawnie --prod.`);
    }
    const stats = await ToolsDb.transaction<{ contracts: number; personnel: number }>(async (conn) => {
        const contractIds = await findFidmanPersonnelContracts(undefined, conn);
        let personnel = 0;
        for (const id of contractIds) {
            const envelope = await buildContractPersonnelPayload(id, conn);
            personnel += envelope.payload.personnel.length;
            if (apply) await enqueueFidmanPersonnelPush(id, conn);
        }
        return { contracts: contractIds.length, personnel };
    });
    console.log(`[WNM-2] ${apply ? 'APPLY' : 'DRY-RUN'}: umowy=${stats.contracts}, wpisy personelu=${stats.personnel}. Dostawa przez drain.`);
}

main().then(() => process.exit(0)).catch((error) => {
    console.error('[WNM-2]', error instanceof Error ? error.message : error);
    process.exit(1);
});
