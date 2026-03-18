import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
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
    const top = Math.max(1, Number(parseArg('top', process.env.BUGFIX_DAILY_INBOX_TOP || '10')) || 10);
    const out =
        parseArg('out', process.env.BUGFIX_DAILY_INBOX_OUT || 'tmp/bugfix-daily-inbox.json') ||
        'tmp/bugfix-daily-inbox.json';

    const repository = new BugEventRepository();
    const bugs = await repository.getInboxCandidates(top);

    const payload = {
        generatedAt: new Date().toISOString(),
        count: bugs.length,
        top,
        bugs,
    };

    const outPath = path.resolve(out);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');

    console.log(`[bugfix:daily-inbox] generated ${bugs.length} items in ${outPath}`);
}

main().catch((error) => {
    console.error('[bugfix:daily-inbox] failed:', error);
    process.exit(1);
});
