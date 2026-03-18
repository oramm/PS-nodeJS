import { syncBugToGithub } from '../githubSync';
import { BugEventRecord } from '../BugEvent';

const sampleBug: BugEventRecord = {
    id: 42,
    fingerprint: 'f'.repeat(64),
    status: 'triaged',
    severity: 'high',
    source: 'express_error_middleware',
    message: 'Sample runtime error',
    stack: 'Error: Sample runtime error\n at test',
    requestContext: { path: '/test' },
    userContext: { userId: 'u1' },
    env: 'production',
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    occurrenceCount: 2,
    githubIssueNumber: null,
    resolutionNotes: null,
    fixedCommitSha: null,
    resolvedAt: null,
    tags: ['runtime'],
    priorityScore: 80,
};

describe('githubSync', () => {
    it('returns dry-run action without calling GitHub API', async () => {
        const fetchSpy = jest.spyOn(global, 'fetch' as any).mockImplementation(() => {
            throw new Error('fetch should not be called in dry-run');
        });

        const result = await syncBugToGithub({
            token: 'token',
            repoSlug: 'owner/repo',
            bug: sampleBug,
            dryRun: true,
        });

        expect(result).toEqual({ issueNumber: null, action: 'dry-run' });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('throws for invalid repo slug', async () => {
        await expect(
            syncBugToGithub({
                token: 'token',
                repoSlug: 'invalid',
                bug: sampleBug,
                dryRun: true,
            })
        ).rejects.toThrow('Invalid BUG_GITHUB_REPO value');
    });

    it('redacts sensitive details in created GitHub issue body', async () => {
        const bugWithSensitiveData: BugEventRecord = {
            ...sampleBug,
            message: 'failed for john.doe@example.com with token=abc123',
            stack: 'Authorization: Bearer super-secret-token\nfrom 10.10.10.10',
            requestContext: {
                path: '/test',
                email: 'john.doe@example.com',
                apiKey: 'my-key',
            },
            userContext: {
                userName: 'John Doe',
                phone: '123456789',
            },
        };

        const fetchSpy = jest.spyOn(global, 'fetch' as any).mockImplementation(
            async (...args: any[]) => {
                const init = args[1] as any;
                if (init.method === 'GET') {
                    return {
                        ok: true,
                        json: async () => ({ items: [] }),
                    } as any;
                }

                const body = JSON.parse(init.body);
                expect(body.title).toContain('[REDACTED_EMAIL]');
                expect(body.title).not.toContain('john.doe@example.com');
                expect(body.title).not.toContain('abc123');
                expect(body.body).toContain('[REDACTED_EMAIL]');
                expect(body.body).toContain('[REDACTED_TOKEN]');
                expect(body.body).toContain('[REDACTED_IP]');
                expect(body.body).not.toContain('john.doe@example.com');
                expect(body.body).not.toContain('abc123');
                expect(body.body).not.toContain('10.10.10.10');
                return {
                    ok: true,
                    json: async () => ({ number: 123, title: 'test' }),
                } as any;
            }
        );

        const result = await syncBugToGithub({
            token: 'token',
            repoSlug: 'owner/repo',
            bug: bugWithSensitiveData,
            dryRun: false,
        });

        expect(result).toEqual({ issueNumber: 123, action: 'created' });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
});
