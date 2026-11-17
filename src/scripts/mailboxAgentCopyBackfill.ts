import { loadEnv } from '../setup/loadEnv';
import MailboxRepository from '../mailboxes/MailboxRepository';
import MailboxController from '../mailboxes/MailboxController';
import { SB_MAILBOX_PATTERN } from '../sbAccess/sbAccessTypes';

/** Domyślnie tylko plan; jedyny zapis i kontakt z pocztą następuje z --apply. */
export async function main(args = process.argv.slice(2)): Promise<void> {
    const includes = args.filter(arg => arg.startsWith('--include=')).map(arg => arg.slice('--include='.length));
    if (args.some(arg => !['--apply', '--dry-run', '--prod'].includes(arg) && !arg.startsWith('--include='))
        || includes.some(code => !SB_MAILBOX_PATTERN.test(code))
        || (args.includes('--apply') && args.includes('--dry-run')))
        throw new Error('Użycie: yarn mailboxes:agent-copy [--dry-run | --apply] [--include=<kod>] [--prod]');
    loadEnv();
    const apply = args.includes('--apply');
    const host = (process.env.DB_HOST || '').trim().toLowerCase();
    if (apply && !['localhost', '127.0.0.1'].includes(host) && !args.includes('--prod'))
        throw new Error('Zapis do zdalnej bazy wymaga jawnego --prod.');
    const mailboxes = await new MailboxRepository().find();
    for (const mailbox of mailboxes) {
        if (mailbox.statusCode !== 'ACTIVE' || mailbox.agentCopyStatus !== 'PENDING') continue;
        if (mailbox.projectId === null && mailbox.contractId === null && !includes.includes(mailbox.code)) continue;
        console.log(`[MBX] ${apply ? 'APPLY' : 'DRY-RUN'}: kopia dla ${mailbox.address}`);
        if (apply) {
            const updated = await MailboxController.agentCopy(mailbox.id!);
            console.log(`[MBX] ${mailbox.code}: ${updated.agentCopyStatus}${updated.agentCopyLastError ? ` - ${updated.agentCopyLastError}` : ''}`);
        }
    }
}

if (require.main === module) main().then(() => process.exit(0)).catch(() => {
    // Surowy błąd bazy/HTTP może zawierać poświadczenia; nie trafia do raportu.
    console.error('[MBX] Nie udało się uzupełnić kopii poczty. Sprawdź konfigurację i stan skrzynek w PS.');
    process.exit(1);
});
