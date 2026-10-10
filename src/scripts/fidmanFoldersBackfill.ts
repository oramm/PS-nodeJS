import ToolsDb from '../tools/ToolsDb';
import { loadEnv } from '../setup/loadEnv';
import {
    buildContractFoldersPayload,
    enqueueFidmanFoldersPush,
    findFidmanPersonnelContracts,
} from '../contracts/fidmanSync/FidmanSync';

/** LMF-4: domyślnie tylko odczyt; --apply zapisuje kolejkę (tryb wymuszony), bez dostawy HTTP. */
async function main(): Promise<void> {
    const args = process.argv.slice(2);
    if (args.some((arg) => !['--apply', '--dry-run', '--prod'].includes(arg)) ||
        (args.includes('--apply') && args.includes('--dry-run'))) {
        throw new Error('Użycie: yarn ts-node src/scripts/fidmanFoldersBackfill.ts [--dry-run | --apply] [--prod]');
    }
    const apply = args.includes('--apply');
    loadEnv();
    const host = (process.env.DB_HOST || '').trim().toLowerCase();
    const local = host === 'localhost' || host === '127.0.0.1';
    console.log(`[LMF-4] DB: ${host}/${process.env.DB_NAME} (${local ? 'lokalna' : 'ZDALNA'})`);
    if (!local && !args.includes('--prod')) {
        throw new Error(`Odmowa: DB_HOST="${host}" nie jest lokalny. Uruchom z NODE_ENV=development albo podaj jawnie --prod.`);
    }
    const stats = await ToolsDb.transaction<{
        contracts: number; cases: number; withoutContractFolder: number; enqueued: number;
    }>(async (conn) => {
        // Ten sam zakres co contract.upsert (D-LMF-6); Id rosnąco = kolejność blokad umów.
        const contractIds = await findFidmanPersonnelContracts(undefined, conn);
        let cases = 0;
        let withoutContractFolder = 0;
        let enqueued = 0;
        for (const id of contractIds) {
            const envelope = await buildContractFoldersPayload(id, conn);
            cases += envelope.payload.cases.length;
            if (!envelope.payload.contractFolderId) withoutContractFolder++;
            if (apply && (await enqueueFidmanFoldersPush(id, conn, true)) !== null) enqueued++;
        }
        return { contracts: contractIds.length, cases, withoutContractFolder, enqueued };
    });
    console.log(
        `[LMF-4] ${apply ? 'APPLY' : 'DRY-RUN'}: umowy=${stats.contracts}, sprawy=${stats.cases}, ` +
        `umowy bez folderu=${stats.withoutContractFolder}, wpisy w kolejce=${stats.enqueued}. Dostawa przez drain.`
    );
}

main().then(() => process.exit(0)).catch((error) => {
    console.error('[LMF-4]', error instanceof Error ? error.message : error);
    process.exit(1);
});
