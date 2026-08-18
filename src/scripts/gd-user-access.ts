/**
 * GDZIE DANA OSOBA MA DOSTĘP NA DRIVE — i gdzie wystarczy ciąć.
 *
 * W 100% READ-ONLY. Używa wyłącznie:
 *   drive.files.list, drive.permissions.list, drive.files.get, drive.drives.list
 * Żadnego create/update/delete. Nie da się tym skryptem nic zmienić.
 *
 * IDEA
 * ----
 * Uprawnienie nadane na folderze dziedziczy się w dół, więc zdjęcie go z rodzica
 * odbiera dostęp do całej gałęzi. Interesują nas WYŁĄCZNIE punkty, w których
 * uprawnienie zostało nadane wprost — to jedyne miejsca, w których trzeba ciąć.
 *
 * Sztuczka, dzięki której nie trzeba pytać o uprawnienia każdego obiektu:
 *
 *   Niech S = zbiór folderów, do których osoba ma dostęp (jedno zapytanie).
 *   Folder X jest PUNKTEM CIĘCIA wtedy i tylko wtedy, gdy żaden z rodziców X
 *   nie należy do S.
 *
 *   Bo jeśli dostęp do X jest dziedziczony, to z definicji rodzic też go daje,
 *   czyli rodzic jest w S. Brak rodzica w S ⇒ dostęp nadany wprost na X.
 *
 * To czysta arytmetyka na zbiorach — zero dodatkowych zapytań. permissions.list
 * odpytujemy dopiero dla garstki wyłonionych punktów cięcia, żeby poznać rolę
 * i potwierdzić klasyfikację.
 *
 * Użycie:
 *   yarn gd:user-access --email ktos@envi.com.pl
 *   ... --files                # dodatkowo pliki udostępnione punktowo (wolne)
 *   ... --under <folderId>     # ogranicz raport do jednej gałęzi
 *   ... --out raport.csv
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import { google, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { oAuthClient } from '../setup/Sessions/ToolsGapi';
import Setup from '../setup/Setup';
import { writeFileSync } from 'fs';
import path from 'path';

const FOLDER = 'application/vnd.google-apps.folder';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseArg(name: string, def?: string): string | undefined {
    const a = process.argv.slice(2);
    const i = a.findIndex((x) => x === `--${name}`);
    if (i === -1) return def;
    const n = a[i + 1];
    if (n === undefined || n.startsWith('--')) return 'true';
    return n;
}

function reason(err: any): string {
    return (
        err?.response?.data?.error?.errors?.[0]?.reason ??
        err?.errors?.[0]?.reason ??
        ''
    );
}
const NETWORK_ERRORS = [
    'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND',
    'EAI_AGAIN', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH',
];
function retryable(err: any): boolean {
    const code = err?.response?.status ?? err?.code;
    if (typeof code === 'string' && NETWORK_ERRORS.includes(code)) return true;
    const msg = String(err?.message ?? '');
    if (NETWORK_ERRORS.some((e) => msg.includes(e))) return true;
    if (/socket hang up|network|timeout/i.test(msg)) return true;
    return (
        code === 429 || code === 500 || code === 503 ||
        (code === 403 && /rateLimit|userRateLimit/i.test(reason(err)))
    );
}
async function withRetry<T>(fn: () => Promise<T>, max = 8): Promise<T> {
    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (err: any) {
            if (retryable(err) && attempt < max) {
                await sleep(
                    Math.min(2 ** attempt * 500, 30000) +
                        Math.floor(Math.random() * 400)
                );
                attempt++;
                continue;
            }
            throw err;
        }
    }
}

/** Limiter współbieżności — bez dokładania zależności. */
async function mapLimit<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) || 1 }, async () => {
        while (true) {
            const i = cursor++;
            if (i >= items.length) return;
            out[i] = await fn(items[i], i);
        }
    });
    await Promise.all(workers);
    return out;
}

async function getAuth(): Promise<OAuth2Client> {
    const refreshToken = process.env.REFRESH_TOKEN;
    if (!refreshToken) throw new Error('Brak REFRESH_TOKEN w .env');
    oAuthClient.setCredentials({ refresh_token: refreshToken });
    const t = await oAuthClient.getAccessToken();
    if (!t.token) throw new Error('Nie udało się pobrać access tokenu');
    return oAuthClient;
}

type Node = {
    id: string;
    name: string;
    parents: string[];
    driveId: string;
    isFolder: boolean;
};

/** Metadane po ID, z cache. Trzyma Promise, żeby równoległe wejścia na ten sam
 *  folder dzieliły jedno zapytanie zamiast startować osobne. */
type Meta = { name: string; parents: string[] };
const metaCache = new Map<string, Promise<Meta>>();

function metaOf(drive: drive_v3.Drive, id: string): Promise<Meta> {
    let p = metaCache.get(id);
    if (p) return p;
    p = (async () => {
        try {
            const res = await withRetry(() =>
                drive.files.get({
                    fileId: id,
                    fields: 'id,name,parents',
                    supportsAllDrives: true,
                })
            );
            return { name: res.data.name ?? id, parents: res.data.parents ?? [] };
        } catch {
            return { name: `<niedostępny ${id}>`, parents: [] };
        }
    })();
    metaCache.set(id, p);
    return p;
}

async function pathOf(drive: drive_v3.Drive, n: Node): Promise<string> {
    const parts: string[] = [n.name];
    let parent = n.parents[0];
    let guard = 0;
    const seen = new Set<string>([n.id]);
    while (parent && guard++ < 30 && !seen.has(parent)) {
        seen.add(parent);
        const m = await metaOf(drive, parent);
        parts.unshift(m.name);
        parent = m.parents[0];
    }
    return parts.join(' / ');
}

/** Wszystkie obiekty danego typu, do których osoba ma dostęp (dowolny). */
async function listAccessible(
    drive: drive_v3.Drive,
    email: string,
    foldersOnly: boolean
): Promise<Node[]> {
    const byId = new Map<string, Node>();
    const typeClause = foldersOnly
        ? ` and mimeType = '${FOLDER}'`
        : ` and mimeType != '${FOLDER}'`;
    for (const who of ['owners', 'writers', 'readers']) {
        let pageToken: string | undefined;
        let pages = 0;
        do {
            const res = await withRetry(() =>
                drive.files.list({
                    q: `'${email}' in ${who} and trashed = false${typeClause}`,
                    fields: 'nextPageToken, files(id,name,mimeType,driveId,parents)',
                    pageSize: 1000,
                    pageToken,
                    corpora: 'allDrives',
                    supportsAllDrives: true,
                    includeItemsFromAllDrives: true,
                })
            );
            for (const f of res.data.files ?? []) {
                if (!f.id || byId.has(f.id)) continue;
                byId.set(f.id, {
                    id: f.id,
                    name: f.name ?? '',
                    parents: f.parents ?? [],
                    driveId: f.driveId ?? '',
                    isFolder: f.mimeType === FOLDER,
                });
            }
            pageToken = res.data.nextPageToken ?? undefined;
            if (++pages % 10 === 0)
                console.log(`    ${who}: ${byId.size} narastająco...`);
        } while (pageToken);
        console.log(`  ${who}: ${byId.size} narastająco`);
    }
    return [...byId.values()];
}

type PermInfo = { role: string; kind: string; inheritedFrom: string };

async function permsFor(
    drive: drive_v3.Drive,
    fileId: string,
    email: string
): Promise<PermInfo | null | 'brak-dostepu'> {
    let pageToken: string | undefined;
    try {
        do {
            const res = await withRetry(() =>
                drive.permissions.list({
                    fileId,
                    fields:
                        'nextPageToken, permissions(id,type,role,emailAddress,' +
                        'permissionDetails(permissionType,role,inherited,inheritedFrom))',
                    pageSize: 100,
                    pageToken,
                    supportsAllDrives: true,
                })
            );
            for (const p of res.data.permissions ?? []) {
                if ((p.emailAddress ?? '').toLowerCase() !== email) continue;
                const det = p.permissionDetails?.[0];
                const kind =
                    p.role === 'owner'
                        ? 'wlasciciel'
                        : !det
                        ? 'nieznane'
                        : det.inherited
                        ? 'dziedziczone'
                        : 'bezposrednie';
                return { role: p.role ?? '', kind, inheritedFrom: det?.inheritedFrom ?? '' };
            }
            pageToken = res.data.nextPageToken ?? undefined;
        } while (pageToken);
    } catch (err: any) {
        // Konto master bywa tylko czytelnikiem cudzego pliku — wtedy Google nie
        // pozwala odczytać listy uprawnień. To nie jest powód, żeby przerwać skan.
        if (err?.response?.status === 403) return 'brak-dostepu';
        throw err;
    }
    return null;
}

async function main() {
    const email = (parseArg('email') ?? '').toLowerCase();
    if (!email || email === 'true') {
        console.error('Podaj adres: --email ktos@domena.pl');
        process.exit(1);
    }
    const withFiles = parseArg('files') === 'true';
    const under = parseArg('under');
    const concurrency = Number(parseArg('concurrency', '8'));
    const out = parseArg('out');

    const auth = await getAuth();
    const drive = google.drive({ version: 'v3', auth });

    console.log(`\nSprawdzam dostępy dla: ${email}`);
    console.log('Tryb: READ-ONLY (żadnych zmian)\n');

    // 1. Członkostwo w dyskach współdzielonych. Nie jest uprawnieniem do folderu
    //    i NIE zniknie po zdjęciu permission z jakiegokolwiek folderu.
    console.log('--- Dyski współdzielone ---');
    try {
        const drives = await withRetry(() =>
            drive.drives.list({ pageSize: 100, fields: 'drives(id,name)' })
        );
        const list = drives.data.drives ?? [];
        console.log(`  Konto master widzi ${list.length} dysków współdzielonych.`);
        for (const d of list) {
            if (!d.id) continue;
            const p = await permsFor(drive, d.id, email);
            if (p === 'brak-dostepu')
                console.log(`  [?] ${d.name} — brak wglądu w uprawnienia dysku`);
            else if (p)
                console.log(`  [CZŁONEK DYSKU] ${d.name} (${d.id}) — rola: ${p.role}`);
        }
    } catch (e: any) {
        console.log(`  (nie udało się wylistować: ${e?.message ?? e})`);
    }

    // 2. Foldery. Punkty cięcia liczone z samej struktury rodziców.
    console.log('\n--- Foldery z dostępem ---');
    const folders = await listAccessible(drive, email, true);
    console.log(`  Razem folderów: ${folders.length}`);

    const inSet = new Set(folders.map((f) => f.id));
    const roots = folders.filter((f) => !f.parents.some((p) => inSet.has(p)));
    console.log(`  Z tego punktów cięcia (żaden rodzic nie daje dostępu): ${roots.length}`);

    console.log('\n--- Potwierdzam uprawnienia punktów cięcia ---');
    let done = 0;
    const confirmed = await mapLimit(roots, concurrency, async (f) => {
        const p = await permsFor(drive, f.id, email);
        const info: PermInfo =
            p === 'brak-dostepu'
                ? { role: '?', kind: 'brak-wgladu', inheritedFrom: '' }
                : p ?? { role: '?', kind: 'nie-znaleziono', inheritedFrom: '' };
        const full = await pathOf(drive, f);
        done++;
        if (done % 10 === 0 || done === roots.length)
            console.log(`  ${done}/${roots.length}`);
        return { node: f, info, path: full };
    });

    // 3. Pliki udostępnione punktowo — ta sama arytmetyka: plik, którego żaden
    //    rodzic nie jest w zbiorze folderów, dostał dostęp wprost.
    let fileCuts: { node: Node; info: PermInfo; path: string }[] = [];
    if (withFiles) {
        console.log('\n--- Pliki udostępnione punktowo ---');
        const files = await listAccessible(drive, email, false);
        console.log(`  Razem plików z dostępem: ${files.length}`);
        const orphans = files.filter((f) => !f.parents.some((p) => inSet.has(p)));
        console.log(`  Udostępnionych wprost (poza znanymi folderami): ${orphans.length}`);
        let d2 = 0;
        fileCuts = await mapLimit(orphans, concurrency, async (f) => {
            const p = await permsFor(drive, f.id, email);
            const info: PermInfo =
                p === 'brak-dostepu'
                    ? { role: '?', kind: 'brak-wgladu', inheritedFrom: '' }
                    : p ?? { role: '?', kind: 'nie-znaleziono', inheritedFrom: '' };
            const full = await pathOf(drive, f);
            d2++;
            if (d2 % 25 === 0 || d2 === orphans.length)
                console.log(`  ${d2}/${orphans.length}`);
            return { node: f, info, path: full };
        });
    }

    // 4. Raport
    const filterUnder = (r: { path: string; node: Node }) =>
        !under || under === 'true' || r.node.id === under || r.path.includes(under);

    console.log('\n========================================');
    console.log('PUNKTY CIĘCIA — foldery z uprawnieniem nadanym wprost');
    console.log('(zdjęcie tych odbiera dostęp także do wszystkiego poniżej)');
    console.log('========================================');
    const shown = confirmed.filter(filterUnder).sort((a, b) => a.path.localeCompare(b.path));
    for (const r of shown)
        console.log(
            `  ${(r.info.role || '?').padEnd(9)} ${r.info.kind.padEnd(14)} ${r.path}\n            id=${r.node.id}`
        );
    if (!shown.length) console.log('  (brak)');
    console.log(`\nRazem punktów cięcia: ${shown.length}`);
    console.log(
        `Folderów, które odziedziczą cięcie (nic z nimi nie robisz): ${folders.length - roots.length}`
    );
    if (withFiles) {
        console.log(`\nPliki udostępnione punktowo: ${fileCuts.length}`);
        for (const r of fileCuts.filter(filterUnder))
            console.log(`  ${(r.info.role || '?').padEnd(9)} ${r.path}  id=${r.node.id}`);
    } else {
        console.log('\n(pliki udostępnione punktowo: pominięte — dodaj --files)');
    }

    if (out) {
        const file = path.resolve(out);
        const rows = [
            'typ,rola,klasyfikacja,nazwa,sciezka,id,driveId',
            ...confirmed.map((r) =>
                ['folder', r.info.role, r.info.kind, r.node.name, r.path, r.node.id, r.node.driveId]
                    .map((v) => `"${String(v).replace(/"/g, '""')}"`)
                    .join(',')
            ),
            ...fileCuts.map((r) =>
                ['plik', r.info.role, r.info.kind, r.node.name, r.path, r.node.id, r.node.driveId]
                    .map((v) => `"${String(v).replace(/"/g, '""')}"`)
                    .join(',')
            ),
        ];
        writeFileSync(file, '﻿' + rows.join('\n'), 'utf8');
        console.log(`\nCSV: ${file}`);
    }
}

main().catch((e) => {
    console.error(e?.message ?? e);
    process.exit(1);
});
