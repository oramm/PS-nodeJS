import { loadEnv } from '../setup/loadEnv';
import BugEventRepository from '../bugEvents/BugEventRepository';

loadEnv();

function parseArg(name: string, defaultValue?: string): string | undefined {
    const args = process.argv.slice(2);
    const index = args.findIndex((arg) => arg === `--${name}`);
    if (index === -1) return defaultValue;
    return args[index + 1] || defaultValue;
}

async function main() {
    const months = Math.max(
        1,
        Number(parseArg('months', process.env.BUGFIX_RETENTION_MONTHS || '6')) || 6
    );

    const repository = new BugEventRepository();
    const result = await repository.archiveResolvedOlderThan(months);

    console.log(
        `[bugfix:retention] archived=${result.archivedCount}, deleted=${result.deletedCount}, months=${months}`
    );
}

main().catch((error) => {
    console.error('[bugfix:retention] failed:', error);
    process.exit(1);
});
