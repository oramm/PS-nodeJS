import { describe, expect, it } from '@jest/globals';
import { resolveSessionSecrets } from '../sessionSecret';

const LEGACY = 'your-random-secret-19890913007';

describe('resolveSessionSecrets', () => {
    it('refuses to start in production without SESSION_SECRET', () => {
        expect(() =>
            resolveSessionSecrets({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
        ).toThrow(/SESSION_SECRET/);
    });

    it('refuses to start in production when SESSION_SECRET is still the retired literal', () => {
        expect(() =>
            resolveSessionSecrets({
                NODE_ENV: 'production',
                SESSION_SECRET: LEGACY,
            } as NodeJS.ProcessEnv),
        ).toThrow(/SESSION_SECRET/);
    });

    it('signs with the new secret and keeps the legacy one for verification', () => {
        expect(
            resolveSessionSecrets({
                NODE_ENV: 'production',
                SESSION_SECRET: '  fresh-secret  ',
            } as NodeJS.ProcessEnv),
        ).toEqual(['fresh-secret', LEGACY]);
    });

    it('falls back to the legacy secret outside production', () => {
        expect(
            resolveSessionSecrets({
                NODE_ENV: 'development',
            } as NodeJS.ProcessEnv),
        ).toEqual([LEGACY]);
    });
});
