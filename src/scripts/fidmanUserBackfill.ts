import Setup from '../setup/Setup';
import ToolsDb from '../tools/ToolsDb';
import { loadEnv } from '../setup/loadEnv';
import PersonRepository from '../persons/PersonRepository';
import {
    enqueueFidmanUserPush,
    validateFidmanUserSource,
    UserSyncRecipient,
} from '../contracts/fidmanSync/FidmanSync';

export function userBackfillRecipients(args: string[]): UserSyncRecipient[] {
    const option = args.filter((arg) => arg.startsWith('--recipient='));
    const recipient = option[0]?.slice('--recipient='.length) ?? 'fidman';
    if (option.length > 1 || !['fidman', 'fin', 'all'].includes(recipient)) {
        throw new Error('Odbiorca musi mieć wartość fidman, fin albo all.');
    }
    return recipient === 'all' ? ['fidman', 'fin'] : [recipient as UserSyncRecipient];
}

/** RFS: domyślnie tylko odczyt; --apply zapisuje kolejkę, bez dostawy HTTP. */
export async function main(args = process.argv.slice(2)): Promise<void> {
    const recipients = userBackfillRecipients(args);
    if (
        args.some((arg) =>
            !['--apply', '--dry-run', '--prod'].includes(arg) &&
            !arg.startsWith('--recipient='),
        ) || (args.includes('--apply') && args.includes('--dry-run'))
    ) {
        throw new Error('Użycie: yarn ts-node src/scripts/fidmanUserBackfill.ts [--dry-run | --apply] [--prod] [--recipient=fidman|fin|all]');
    }
    const apply = args.includes('--apply');
    loadEnv();
    if (recipients.includes('fin') && (!Setup.FinSync.baseUrl || !Setup.FinSync.token)) {
        throw new Error('[FIN] Wymagane FIN_SYNC_BASE_URL i FIN_SYNC_TOKEN dla backfillu FIN.');
    }
    const host = (process.env.DB_HOST || '').trim().toLowerCase();
    const local = host === 'localhost' || host === '127.0.0.1';
    console.log(`[RFS] DB: ${host}/${process.env.DB_NAME} (${local ? 'lokalna' : 'ZDALNA'})`);
    if (!local && !args.includes('--prod')) {
        throw new Error(`Odmowa: DB_HOST="${host}" nie jest lokalny. Uruchom z NODE_ENV=development albo podaj jawnie --prod.`);
    }
    const stats = await ToolsDb.transaction<{ total: number; skipped: number; roles: [string, number][] }>(async (conn) => {
        let total = 0;
        const repository = new PersonRepository();
        const roles = new Map<string, number>();
        let skipped = 0;
        for (const recipient of recipients) {
            const column = recipient === 'fin' ? 'FinEnabled' : 'FidmanEnabled';
            const [rows] = await conn.query<any[]>(
                `SELECT PersonId FROM PersonAccounts WHERE ${column} = 1`,
            );
            total += rows.length;
            for (const row of rows) {
                const source = await repository.getFidmanUserSourceInConn(
                    conn, row.PersonId,
                );
                const problems = source
                    ? validateFidmanUserSource(source, recipient)
                    : ['Nie znaleziono osoby.'];
                if (!source || problems.length) {
                    skipped++;
                    console.log(`[RFS/${recipient}] PersonId=${row.PersonId}: ${problems.join(' ')}`);
                    continue;
                }
                const role = source.systemRoleName ?? '(brak roli)';
                roles.set(role, (roles.get(role) ?? 0) + 1);
                if (apply) await enqueueFidmanUserPush(source, true, conn, recipient);
            }
        }
        return { total, skipped, roles: [...roles] };
    });
    for (const [role, count] of stats.roles) console.log(`[RFS] ${role}: ${count}`);
    console.log(`[RFS] ${apply ? 'APPLY' : 'DRY-RUN'}: wysyłki=${stats.total}, pominięte=${stats.skipped}. Dostawa przez drain.`);
}

if (require.main === module) main().then(() => process.exit(0)).catch((error) => {
    console.error('[RFS]', error instanceof Error ? error.message : error);
    process.exit(1);
});
