import { BugEventRecord } from './BugEvent';

interface GithubRepoSlug {
    owner: string;
    repo: string;
}

interface GithubIssue {
    number: number;
    title: string;
    html_url?: string;
}

function parseRepoSlug(repoSlug: string): GithubRepoSlug {
    const [owner, repo] = repoSlug.split('/');
    if (!owner || !repo) {
        throw new Error(`Invalid BUG_GITHUB_REPO value: ${repoSlug}. Expected owner/repo.`);
    }
    return { owner, repo };
}

function buildIssueTitle(bug: BugEventRecord): string {
    const safeMessage = redactSensitiveText(bug.message || '(no message)');
    const short = safeMessage.replace(/\s+/g, ' ').trim().slice(0, 90);
    return `[bug:${bug.fingerprint.slice(0, 12)}] ${short}`;
}

function redactSensitiveText(input: string): string {
    return input
        .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
        .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[REDACTED_IP]')
        .replace(/\bBearer\s+[A-Za-z0-9._\-~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]')
        .replace(/\b(?:api[_-]?key|apikey|token|secret|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]');
}

function sanitizeForGithub(value: unknown): unknown {
    const seen = new WeakSet<object>();

    const redact = (input: unknown): unknown => {
        if (input === null || input === undefined) return input;
        if (typeof input === 'string') {
            return redactSensitiveText(input);
        }
        if (typeof input !== 'object') return input;

        if (seen.has(input as object)) return '[Circular]';
        seen.add(input as object);

        if (Array.isArray(input)) {
            return input.slice(0, 50).map((item) => redact(item));
        }

        const output: Record<string, unknown> = {};
        for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
            const normalizedKey = key.toLowerCase();
            const isSensitive =
                normalizedKey.includes('token') ||
                normalizedKey.includes('secret') ||
                normalizedKey.includes('password') ||
                normalizedKey.includes('cookie') ||
                normalizedKey.includes('authorization') ||
                normalizedKey.includes('ip') ||
                normalizedKey.includes('userid') ||
                normalizedKey.includes('session') ||
                normalizedKey.includes('email') ||
                normalizedKey.includes('name') ||
                normalizedKey.includes('phone') ||
                normalizedKey.includes('apikey') ||
                normalizedKey.includes('api_key') ||
                normalizedKey.includes('bearer');

            if (isSensitive) {
                output[key] = '[REDACTED]';
                continue;
            }

            output[key] = redact(raw);
        }

        return output;
    };

    return redact(value);
}

function buildIssueBody(bug: BugEventRecord): string {
    const safeRequestContext = sanitizeForGithub(bug.requestContext || {});
    const safeUserContext = sanitizeForGithub(bug.userContext || {});
    const safeMessage = redactSensitiveText(bug.message || '(no message)');
    const limitedStack = redactSensitiveText((bug.stack || '(no stack)').slice(0, 4000));

    return [
        `## Runtime Bug Event #${bug.id}`,
        '',
        `- Fingerprint: \`${bug.fingerprint}\``,
        `- Severity: \`${bug.severity}\``,
        `- Source: \`${bug.source}\``,
        `- Env: \`${bug.env}\``,
        `- Occurrences: **${bug.occurrenceCount}**`,
        `- Priority Score: **${bug.priorityScore}**`,
        '',
        '### Message',
        '```text',
        safeMessage,
        '```',
        '',
        '### Stack',
        '```text',
        limitedStack,
        '```',
        '',
        '### Request Context',
        '```json',
        JSON.stringify(safeRequestContext, null, 2),
        '```',
        '',
        '### User Context',
        '```json',
        JSON.stringify(safeUserContext, null, 2),
        '```',
        '',
        `Origin DB bug ID: ${bug.id}`,
    ].join('\n');
}

async function githubRequest<T>(params: {
    method: 'GET' | 'POST';
    token: string;
    url: string;
    body?: Record<string, unknown>;
}): Promise<T> {
    const response = await fetch(params.url, {
        method: params.method,
        headers: {
            Authorization: `Bearer ${params.token}`,
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
            'User-Agent': 'ps-nodejs-bugfix-sync',
        },
        body: params.body ? JSON.stringify(params.body) : undefined,
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`GitHub API ${response.status}: ${text}`);
    }

    return (await response.json()) as T;
}

async function findExistingIssue(params: {
    token: string;
    owner: string;
    repo: string;
    fingerprint: string;
}): Promise<GithubIssue | null> {
    const query = encodeURIComponent(
        `repo:${params.owner}/${params.repo} ${params.fingerprint} in:body is:issue`
    );

    const search = await githubRequest<{ items: GithubIssue[] }>({
        method: 'GET',
        token: params.token,
        url: `https://api.github.com/search/issues?q=${query}&per_page=1`,
    });

    if (!Array.isArray(search.items) || search.items.length === 0) {
        return null;
    }

    return search.items[0];
}

async function createIssue(params: {
    token: string;
    owner: string;
    repo: string;
    title: string;
    body: string;
}): Promise<GithubIssue> {
    return githubRequest<GithubIssue>({
        method: 'POST',
        token: params.token,
        url: `https://api.github.com/repos/${params.owner}/${params.repo}/issues`,
        body: {
            title: params.title,
            body: params.body,
            labels: ['bug', 'runtime', 'autogenerated'],
        },
    });
}

export async function syncBugToGithub(params: {
    token: string;
    repoSlug: string;
    bug: BugEventRecord;
    dryRun: boolean;
}): Promise<{ issueNumber: number | null; action: 'found' | 'created' | 'dry-run' }> {
    const { owner, repo } = parseRepoSlug(params.repoSlug);

    if (params.dryRun) {
        return { issueNumber: null, action: 'dry-run' };
    }

    const existing = await findExistingIssue({
        token: params.token,
        owner,
        repo,
        fingerprint: params.bug.fingerprint,
    });

    if (existing) {
        return { issueNumber: existing.number, action: 'found' };
    }

    const issue = await createIssue({
        token: params.token,
        owner,
        repo,
        title: buildIssueTitle(params.bug),
        body: buildIssueBody(params.bug),
    });

    return { issueNumber: issue.number, action: 'created' };
}
