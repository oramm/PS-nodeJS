import { mkdirSync, writeFileSync } from 'fs';
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
    const top = Math.max(1, Number(parseArg('top', '1')) || 1);
    const mode = parseArg('mode', 'analyze+patch') || 'analyze+patch';
    const out = parseArg('out', 'tmp/bug-context.json') || 'tmp/bug-context.json';
    const statusesArg = parseArg('statuses', 'new,triaged') || 'new,triaged';

    const statuses = statusesArg
        .split(',')
        .map((status) => status.trim())
        .filter((status) => status.length > 0) as BugStatus[];

    const repository = new BugEventRepository();
    const bugs = await repository.find({
        statuses: statuses.length > 0 ? statuses : ['new', 'triaged'],
        limit: top,
    });

    const payload = {
        bugs: bugs.map((bug) => ({
            id: bug.id,
            fingerprint: bug.fingerprint,
            message: bug.message,
            stack: bug.stack,
            request_context: bug.requestContext,
            user_context: bug.userContext,
            occurrence_count: bug.occurrenceCount,
            severity: bug.severity,
            source: bug.source,
            priority_score: bug.priorityScore,
        })),
        mode,
        repo_path: '.',
    };

    const outPath = path.resolve(out);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');

    console.log(`[bugfix:run] Context file generated: ${outPath}`);
    console.log('[bugfix:run] Next step: run local Codex/Claude session with factory/prompts/bug-fix-loop.md and this context file.');
}

main().catch((error) => {
    console.error('[bugfix:run] failed:', error);
    process.exit(1);
});
