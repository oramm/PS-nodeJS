import { loadEnv } from '../setup/loadEnv';
import BugEventRepository from '../bugEvents/BugEventRepository';
import { syncBugToGithub } from '../bugEvents/githubSync';

loadEnv();

function parseArg(name: string, defaultValue?: string): string | undefined {
    const args = process.argv.slice(2);
    const index = args.findIndex((arg) => arg === `--${name}`);
    if (index === -1) return defaultValue;
    return args[index + 1] || defaultValue;
}

function hasFlag(name: string): boolean {
    return process.argv.slice(2).includes(`--${name}`);
}

async function main() {
    const enabled = process.env.BUG_GITHUB_SYNC_ENABLED === 'true';
    if (!enabled) {
        console.log('[bugfix:sync-github] disabled (BUG_GITHUB_SYNC_ENABLED != true)');
        process.exit(0);
    }

    const repository = new BugEventRepository();
    const top = Math.max(1, Number(parseArg('top', '10')) || 10);
    const dryRun = hasFlag('dry-run') || parseArg('dry-run', 'false') === 'true';

    const candidates = await repository.find({ statuses: ['triaged'], limit: top });
    const withoutIssue = candidates.filter((candidate) => !candidate.githubIssueNumber);

    console.log(`[bugfix:sync-github] candidates without issue: ${withoutIssue.length}`);

    if (!process.env.BUG_GITHUB_REPO || !process.env.BUG_GITHUB_TOKEN) {
        console.warn('[bugfix:sync-github] Missing BUG_GITHUB_REPO or BUG_GITHUB_TOKEN. Nothing was synced.');
        process.exit(0);
    }

    for (const bug of withoutIssue) {
        try {
            const result = await syncBugToGithub({
                token: process.env.BUG_GITHUB_TOKEN,
                repoSlug: process.env.BUG_GITHUB_REPO,
                bug,
                dryRun,
            });

            if (dryRun) {
                console.log(
                    `[dry-run] would sync bug id=${bug.id} fingerprint=${bug.fingerprint} to ${process.env.BUG_GITHUB_REPO}`
                );
                continue;
            }

            if (!result.issueNumber) {
                console.warn(
                    `[bugfix:sync-github] no issue number returned for bug id=${bug.id}`
                );
                continue;
            }

            await repository.linkGithubIssue(bug.id, result.issueNumber);
            console.log(
                `[bugfix:sync-github] ${result.action} issue #${result.issueNumber} for bug id=${bug.id}`
            );
        } catch (error) {
            console.error(
                `[bugfix:sync-github] failed for bug id=${bug.id}:`,
                error
            );
        }
    }
}

main().catch((error) => {
    console.error('[bugfix:sync-github] failed:', error);
    process.exit(1);
});
