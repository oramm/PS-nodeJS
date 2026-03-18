import { writeFileSync } from 'fs';
import path from 'path';
import { loadEnv } from '../setup/loadEnv';
import BugEventRepository from '../bugEvents/BugEventRepository';
import { BugStatus } from '../bugEvents/BugEvent';

loadEnv();

function parseArg(name: string, defaultValue?: string): string | undefined {
    const args = process.argv.slice(2);
    const index = args.findIndex((arg) => arg === `--${name}`);
    if (index === -1) return defaultValue;
    return args[index + 1] || defaultValue;
}

async function main() {
    const top = Math.max(1, Number(parseArg('top', '10')) || 10);
    const statusesArg = parseArg('statuses', 'new,triaged') || 'new,triaged';
    const statuses = statusesArg
        .split(',')
        .map((status) => status.trim())
        .filter((status) => status.length > 0) as BugStatus[];

    const out = parseArg('out');

    const repository = new BugEventRepository();
    const bugs = await repository.find({
        statuses: statuses.length > 0 ? statuses : ['new', 'triaged'],
        limit: top,
    });

    const payload = {
        generatedAt: new Date().toISOString(),
        count: bugs.length,
        bugs,
    };

    const serialized = JSON.stringify(payload, null, 2);
    if (out) {
        const outPath = path.resolve(out);
        writeFileSync(outPath, serialized, 'utf8');
        console.log(`Saved scan to: ${outPath}`);
    } else {
        console.log(serialized);
    }
}

main().catch((error) => {
    console.error('[bugfix:scan] failed:', error);
    process.exit(1);
});
