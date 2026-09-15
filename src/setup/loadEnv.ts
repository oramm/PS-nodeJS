import dotenv from 'dotenv';
import path from 'path';

export function loadEnv(): void {
    const shellEnv = { ...process.env };

    const rootEnv = dotenv.config();
    const rootKsefEnvironment = rootEnv.parsed?.KSEF_ENVIRONMENT?.trim();
    const nodeEnv = process.env.NODE_ENV || 'production';
    const envFile = path.resolve(process.cwd(), `.env.${nodeEnv}`);
    dotenv.config({ path: envFile, override: true });

    Object.entries(shellEnv).forEach(([key, value]) => {
        if (key === 'KSEF_ENVIRONMENT' || value === undefined) {
            return;
        }

        // Avoid wiping .env values with empty inherited shell variables.
        if (typeof value === 'string' && value.trim().length === 0) {
            return;
        }

        process.env[key] = value;
    });

    if (rootKsefEnvironment) {
        process.env.KSEF_ENVIRONMENT = rootKsefEnvironment;
    }

    assertDevSessionStoreIsolated(
        nodeEnv,
        process.env.MONGO_URI,
        rootEnv.parsed?.MONGO_URI,
    );

    const ksefEnvironment = process.env.KSEF_ENVIRONMENT || 'test';
    const isProductionKsef = ksefEnvironment === 'production';
    const testToken = process.env.KSEF_TOKEN?.trim();
    const productionToken = process.env.KSEF_TOKEN_PRODUCTION?.trim();
    let ksefTokenSource: 'missing' | 'KSEF_TOKEN' | 'KSEF_TOKEN_PRODUCTION' =
        'missing';

    if (isProductionKsef) {
        if (productionToken) {
            process.env.KSEF_TOKEN = productionToken;
            ksefTokenSource = 'KSEF_TOKEN_PRODUCTION';
        } else if (testToken) {
            process.env.KSEF_TOKEN = testToken;
            ksefTokenSource = 'KSEF_TOKEN';
        }
    } else if (testToken) {
        process.env.KSEF_TOKEN = testToken;
        ksefTokenSource = 'KSEF_TOKEN';
    }

    const ksefApiOverride = process.env.KSEF_API_BASE_URL?.trim();
    const ksefApiBaseUrl = ksefApiOverride
        ? ksefApiOverride.replace(/\/+$/, '')
        : ksefEnvironment === 'production'
          ? 'https://api.ksef.mf.gov.pl/v2'
          : 'https://api-test.ksef.mf.gov.pl/v2';

    console.log(`[ENV] Environment: ${nodeEnv}`);
    console.log(
        `[ENV] DB target: ${process.env.DB_HOST}/${process.env.DB_NAME}`,
    );
    console.log(`[ENV] Session store: ${describeMongoTarget(process.env.MONGO_URI)}`);
    console.log(`[ENV] KSeF environment: ${ksefEnvironment}`);
    if (ksefTokenSource === 'missing') {
        console.warn(
            '[ENV] ⚠ KSeF token source: missing — operacje KSeF będą zwracać błędy',
        );
    } else if (ksefTokenSource === 'KSEF_TOKEN_PRODUCTION') {
        console.log('[ENV] KSeF token source: KSEF_TOKEN_PRODUCTION');
    } else {
        console.log('[ENV] KSeF token source: KSEF_TOKEN');
    }
    console.log(
        `[ENV] KSeF API: ${ksefApiBaseUrl}${ksefApiOverride ? ' (override)' : ''}`,
    );
}

/**
 * Dev nie moze dzielic magazynu sesji z produkcja. `.env.development` nadpisuje MySQL, ale
 * dopoki nie nadpisze MONGO_URI, wartosc spada do `.env` i wskazuje produkcyjny Atlas.
 * Wtedy SessionRevoker.revokeForPerson kasuje sesje prawdziwych uzytkownikow (2026-08-17).
 *
 * DLACZEGO HOST+BAZA, A NIE CALY NAPIS (ROD-0, 2026-09-07). Poprzednia wersja porownywala
 * `effectiveUri !== rootEnvUri` jako caly string. To przepuszcza wariant, gdy `.env.development`
 * MA wlasne MONGO_URI, ale rozniace sie od produkcyjnego tylko kosmetycznie (np. koncowy `/`,
 * inna kolejnosc parametrow zapytania, wielkosc liter w hoscie) — a wskazujace TEN SAM klaster
 * i te sama baze. Zmierzone na tym laptopie 2026-09-07: `.env` konczy sie `...w=majority/`,
 * a `.env.development` `...w=majority` (bez ukosnika) — stringi rozne, wiec straznik milczal,
 * mimo ze oba to ten sam produkcyjny Atlas i ta sama kolekcja `sessions`. Porownujemy wiec
 * (host, baza) po odrzuceniu poswiadczen, parametrow i koncowego ukosnika:
 * blokujemy tylko wtedy, gdy dev pisze do tego samego hosta I tej samej bazy co produkcja.
 * Ten sam host, ale inna baza (np. `.../ps_dev`) = inna przestrzen kolekcji = izolacja, przechodzi.
 */
export function assertDevSessionStoreIsolated(
    nodeEnv: string,
    effectiveUri: string | undefined,
    rootEnvUri: string | undefined,
): void {
    if (nodeEnv !== 'development') return;
    if (!rootEnvUri || !effectiveUri) return;

    const dev = parseMongoHostAndDb(effectiveUri);
    const prod = parseMongoHostAndDb(rootEnvUri);
    if (dev.host !== prod.host) return;
    if (dev.db !== prod.db) return;

    throw new Error(
        `[ENV] NODE_ENV=development wskazuje ten sam magazyn sesji co produkcja ` +
            `(host="${prod.host}", baza="${prod.db || '(domyslna)'}"). ` +
            'Sesje deweloperskie trafilyby do produkcyjnej kolekcji sessions, a zmiana roli ' +
            'wylogowalaby prawdziwych uzytkownikow. Ustaw w .env.development MONGO_URI na osobny ' +
            'host albo osobna baze (np. mongodb://127.0.0.1:27017/ps_dev).',
    );
}

/**
 * Host i baza z URI Mongo, bez poswiadczen, parametrow zapytania i koncowego ukosnika.
 * Host jest porownywany bez rozroznienia wielkosci liter (DNS), baza z rozroznieniem
 * (nazwy baz Mongo sa case-sensitive). Brak sciezki bazy => baza pusta (domyslna).
 */
export function parseMongoHostAndDb(uri: string): { host: string; db: string } {
    const withoutScheme = uri.includes('://')
        ? uri.slice(uri.indexOf('://') + 3)
        : uri;
    const withoutCreds = withoutScheme.slice(withoutScheme.indexOf('@') + 1);
    const hostAndPath = withoutCreds.split('?')[0];
    const slash = hostAndPath.indexOf('/');
    const host = (slash === -1 ? hostAndPath : hostAndPath.slice(0, slash))
        .trim()
        .toLowerCase();
    const db =
        slash === -1
            ? ''
            : hostAndPath.slice(slash + 1).replace(/\/+$/, '');
    return { host, db };
}

/** Host i baza z URI, bez loginu i hasla. */
export function describeMongoTarget(uri: string | undefined): string {
    if (!uri) return 'brak MONGO_URI';
    const [scheme, rest] = uri.split('://');
    if (!rest) return uri;
    const hostAndPath = rest.slice(rest.indexOf('@') + 1).split('?')[0];
    return `${scheme}://${hostAndPath}`;
}
