/**
 * The session secret used to sit as a literal in src/index.ts, so it was in the repository
 * and in every clone. It comes from SESSION_SECRET now, and production refuses to start
 * without it — a silent fallback would mean the deployment looks healthy while still signing
 * cookies with a value anyone with repo access can read.
 *
 * Rotation without logging everyone out: express-session signs with the first element of the
 * array and accepts any of the rest, so the old literal stays here as verify-only. Sessions
 * signed before the switch keep working and get re-signed on their next request (`rolling:
 * true` in src/index.ts).
 *
 * REMOVE THE LEGACY ENTRY AFTER 2026-09-16 — that is one cookie maxAge (30 days) from the
 * deploy, by which point no cookie can still carry the old signature. Deleting the constant
 * and the second array element is the whole change.
 */
const LEGACY_SECRET = 'your-random-secret-19890913007';

/**
 * Setting SESSION_SECRET to the legacy literal is treated as not setting it at all: it would
 * pass a naive "is the variable there" check while rotating nothing.
 */
export function resolveSessionSecrets(
    env: NodeJS.ProcessEnv = process.env,
): string[] {
    const current = env.SESSION_SECRET?.trim();

    if (!current || current === LEGACY_SECRET) {
        if (env.NODE_ENV === 'production')
            throw new Error(
                'SESSION_SECRET is missing or still set to the retired literal — refusing to start in production',
            );
        // ponytail: outside production the legacy value keeps local work running; it was
        // never a secret in the first place.
        return [LEGACY_SECRET];
    }

    return [current, LEGACY_SECRET];
}
