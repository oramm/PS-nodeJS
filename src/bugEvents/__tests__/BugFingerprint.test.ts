import { buildBugFingerprint } from '../BugFingerprint';

describe('BugFingerprint', () => {
    it('normalizes line numbers and dynamic ids for stable fingerprint', () => {
        const firstError = new Error(
            'Entity 1234 failed at 2026-03-18 in /contracts/550e8400-e29b-41d4-a716-446655440000'
        );
        firstError.stack =
            'Error: Entity 1234 failed\n at service.call (src/service.ts:10:20)\n at route (src/router.ts:88:3)';
        const first = buildBugFingerprint(firstError);

        const secondError = new Error(
            'Entity 9876 failed at 2026-03-19 in /contracts/9f0f1f12-3d54-4123-8b8f-3f7d8c123999'
        );
        secondError.stack =
            'Error: Entity 9876 failed\n at service.call (src/service.ts:999:200)\n at route (src/router.ts:777:1)';

        const second = buildBugFingerprint(secondError);

        expect(first.fingerprint).toBe(second.fingerprint);
    });
});
