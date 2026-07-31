/**
 * RAPORT OSIĄGALNOŚCI właścicieli plików do migracji (hybryda per-konto).
 *
 * Dla każdego właściciela z audytu (owned_by_other) sprawdza, czy w bazie
 * (Persons / PersonAccounts) jest zapisany GoogleRefreshToken i czy jest WAŻNY.
 *   - token ważny  → można zeskryptować MOVE plików tego konta (ID zachowane),
 *   - brak/niż.    → to konto trafia do ścieżki COPY + reindex.
 *
 * READ-ONLY: czyta CSV audytu + SELECT z bazy + próbne odświeżenie tokenów.
 * Nie modyfikuje ani bazy, ani Drive.
 *
 * Użycie:
 *   yarn gd:reachability
 *   yarn gd:reachability --csv gd-audit-ownership.csv
 *   yarn gd:reachability --no-check     # pomiń walidację tokenów (tylko obecność)
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import { OAuth2Client } from 'google-auth-library';
import { keys } from '../setup/Sessions/credentials';
import ToolsDb from '../tools/ToolsDb';
import { readFileSync } from 'fs';

function parseArg(name: string, def?: string): string | undefined {
    const a = process.argv.slice(2);
    const i = a.findIndex((x) => x === `--${name}`);
    if (i === -1) return def;
    const n = a[i + 1];
    if (n === undefined || n.startsWith('--')) return 'true';
    return n;
}
const hasFlag = (n: string) => process.argv.slice(2).includes(`--${n}`);

// minimalny parser CSV
function parseCsv(t: string): string[][] {
    const rows: string[][] = [];
    let f: string[] = [],
        cur = '',
        q = false;
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (q) {
            if (c === '"') {
                if (t[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else q = false;
            } else cur += c;
        } else {
            if (c === '"') q = true;
            else if (c === ',') {
                f.push(cur);
                cur = '';
            } else if (c === '\n') {
                f.push(cur);
                rows.push(f);
                f = [];
                cur = '';
            } else if (c === '\r') {
            } else cur += c;
        }
    }
    if (cur !== '' || f.length) {
        f.push(cur);
        rows.push(f);
    }
    return rows;
}

/** owner(lower) -> liczba pozycji owned_by_other */
function ownersFromAudit(csvPath: string): Map<string, number> {
    const rows = parseCsv(readFileSync(csvPath, 'utf8'));
    const head = rows[0];
    const idx = Object.fromEntries(head.map((h, i) => [h, i]));
    const out = new Map<string, number>();
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (r.length < head.length) continue;
        if (r[idx.status] !== 'owned_by_other') continue;
        const email = (r[idx.ownerEmail] || '').trim().toLowerCase();
        if (!email) continue;
        out.set(email, (out.get(email) ?? 0) + 1);
    }
    return out;
}

/** email(lower) -> refresh token (z Persons i PersonAccounts) */
async function tokensFromDb(): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const add = (rows: any[]) => {
        for (const r of rows ?? []) {
            const email = (r.SystemEmail || '').trim().toLowerCase();
            const tok = r.GoogleRefreshToken;
            if (email && tok && !map.has(email)) map.set(email, tok);
        }
    };
    add(
        (await ToolsDb.getQueryCallbackAsync(
            `SELECT SystemEmail, GoogleRefreshToken FROM Persons
             WHERE GoogleRefreshToken IS NOT NULL AND GoogleRefreshToken <> ''`
        )) as any[]
    );
    try {
        add(
            (await ToolsDb.getQueryCallbackAsync(
                `SELECT SystemEmail, GoogleRefreshToken FROM PersonAccounts
                 WHERE GoogleRefreshToken IS NOT NULL AND GoogleRefreshToken <> ''`
            )) as any[]
        );
    } catch {
        /* tabela może nie istnieć w starszym schemacie */
    }
    return map;
}

async function tokenValid(token: string): Promise<boolean> {
    const client = new OAuth2Client(
        keys.installed.client_id,
        keys.installed.client_secret,
        keys.installed.redirect_uris[0]
    );
    client.setCredentials({ refresh_token: token });
    try {
        const t = await client.getAccessToken();
        return !!t.token;
    } catch {
        return false;
    }
}

async function main() {
    const csvPath = parseArg('csv', 'gd-audit-ownership.csv')!;
    const check = !hasFlag('no-check');

    console.log('[reach] Wczytywanie właścicieli z audytu...');
    const owners = ownersFromAudit(csvPath);
    console.log(`[reach] Właścicieli owned_by_other: ${owners.size}`);

    console.log('[reach] Pobieranie tokenów z bazy...');
    const tokens = await tokensFromDb();
    console.log(`[reach] Kont z tokenem w bazie: ${tokens.size}`);

    type Row = {
        email: string;
        count: number;
        hasToken: boolean;
        valid: boolean | null;
    };
    const result: Row[] = [];
    for (const [email, count] of owners) {
        const tok = tokens.get(email);
        let valid: boolean | null = null;
        if (tok && check) valid = await tokenValid(tok);
        result.push({ email, count, hasToken: !!tok, valid });
    }
    result.sort((a, b) => b.count - a.count);

    const reachable = result.filter((r) =>
        check ? r.valid === true : r.hasToken
    );
    const notReachable = result.filter((r) =>
        check ? r.valid !== true : !r.hasToken
    );
    const sum = (rs: Row[]) => rs.reduce((s, r) => s + r.count, 0);

    console.log('\n=== OSIĄGALNOŚĆ WŁAŚCICIELI ===');
    console.log('  (MOVE = mamy ważny token → skrypt przeniesie z zachowaniem ID)');
    console.log('  (COPY = brak/niż. tokenu → copy + reindex, nowe ID)\n');
    const flag = (r: Row) =>
        r.hasToken ? (check ? (r.valid ? 'MOVE ✅' : 'token nieważny ❌') : 'MOVE ✅') : 'COPY ⚠️';
    for (const r of result) {
        console.log(
            `  ${flag(r).padEnd(18)} ${String(r.count).padStart(6)}  ${r.email}`
        );
    }

    console.log('\n=== PODSUMOWANIE ===');
    console.log(
        `  MOVE (token ważny):   kont ${reachable.length}, plików ${sum(reachable)}`
    );
    console.log(
        `  COPY (bez tokenu):    kont ${notReachable.length}, plików ${sum(notReachable)}`
    );
    console.log(
        `  RAZEM owned_by_other: kont ${result.length}, plików ${sum(result)}`
    );
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[reach] Błąd:', err);
        process.exit(1);
    });
