/**
 * SKAN UPRAWNIEŃ — czy konto master zdoła przejąć całe drzewo?
 *
 * Odpowiada na dwa pytania krytyczne dla migracji:
 *   1. canCopy               — czy master MOŻE SKOPIOWAĆ każdy cudzy plik?
 *                              (bez tego plik nie trafi na Shared Drive)
 *   2. canMoveItemWithinDrive — czy master MOŻE PRZENIEŚĆ cudzy oryginał
 *                              do archiwum? (bez tego oryginał ZOSTAJE w drzewie
 *                              i BLOKUJE przeciągnięcie folderu na Shared Drive)
 *
 * W 100% READ-ONLY (tylko drive.files.list z polem capabilities).
 *
 * Użycie:
 *   yarn gd:scan-perms                              # domyślnie Setup.Gd.rootFolderId
 *   yarn gd:scan-perms --folderId <ID>
 *   yarn gd:scan-perms --depth 2                    # płytki, szybki zwiad
 *   yarn gd:scan-perms --out blokery.csv            # CSV problematycznych obiektów
 *   yarn gd:scan-perms --concurrency 6
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import { google, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { oAuthClient } from '../setup/Sessions/ToolsGapi';
import Setup from '../setup/Setup';
import { writeFileSync } from 'fs';
import path from 'path';

function parseArg(name: string, def?: string): string | undefined {
    const a = process.argv.slice(2);
    const i = a.findIndex((x) => x === `--${name}`);
    if (i === -1) return def;
    const n = a[i + 1];
    if (n === undefined || n.startsWith('--')) return 'true';
    return n;
}

const FOLDER = 'application/vnd.google-apps.folder';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function reason(err: any): string {
    return (
        err?.response?.data?.error?.errors?.[0]?.reason ??
        err?.errors?.[0]?.reason ??
        ''
    );
}
/** Błędy sieciowe — bez kodu HTTP, ale przejściowe. Przy wielogodzinnych
 *  przebiegach (uśpienie komputera, chwilowy brak sieci) to główne źródło
 *  utraconych plików, jeśli się ich nie ponawia. */
const NETWORK_ERRORS = [
    'ECONNRESET','ETIMEDOUT','ECONNREFUSED','ENOTFOUND',
    'EAI_AGAIN','EPIPE','ENETUNREACH','EHOSTUNREACH',
];
function retryable(err: any): boolean {
    const code = err?.response?.status ?? err?.code;
    if (typeof code === 'string' && NETWORK_ERRORS.includes(code)) return true;
    const msg = String(err?.message ?? '');
    if (NETWORK_ERRORS.some((e) => msg.includes(e))) return true;
    if (/socket hang up|network|timeout/i.test(msg)) return true;
    return (
        code === 429 ||
        code === 500 ||
        code === 503 ||
        (code === 403 && /rateLimit|userRateLimit/i.test(reason(err)))
    );
}
/** licznik ponowień — pokazuje, czy Google dławi przy danej współbieżności */
let retryCount = 0;

async function withRetry<T>(fn: () => Promise<T>, max = 10): Promise<T> {
    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (err: any) {
            if (retryable(err) && attempt < max) {
                retryCount++;
                await sleep(
                    Math.min(2 ** attempt * 500, 60000) +
                        Math.floor(Math.random() * 400)
                );
                attempt++;
                continue;
            }
            throw err;
        }
    }
}

async function getAuth(): Promise<OAuth2Client> {
    const refreshToken = process.env.REFRESH_TOKEN;
    if (!refreshToken) throw new Error('Brak REFRESH_TOKEN w .env');
    oAuthClient.setCredentials({ refresh_token: refreshToken });
    const t = await oAuthClient.getAccessToken();
    if (!t.token) throw new Error('Nie udało się pobrać access tokenu');
    return oAuthClient;
}

async function listChildren(
    drive: drive_v3.Drive,
    parentId: string
): Promise<drive_v3.Schema$File[]> {
    const out: drive_v3.Schema$File[] = [];
    let pageToken: string | undefined;
    do {
        const res = await withRetry(() =>
            drive.files.list({
                q: `'${parentId}' in parents and trashed = false`,
                fields:
                    'nextPageToken, files(id,name,mimeType,ownedByMe,owners(emailAddress),' +
                    'capabilities(canCopy,canMoveItemWithinDrive,canEdit,canDelete))',
                pageSize: 1000,
                pageToken,
                supportsAllDrives: true,
                includeItemsFromAllDrives: true,
            })
        );
        out.push(...(res.data.files ?? []));
        pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);
    return out;
}

type Problem = {
    id: string;
    name: string;
    kind: string;
    owner: string;
    canCopy: string;
    canMove: string;
    pathStr: string;
};

async function main() {
    const rootId = parseArg('folderId', Setup.Gd.rootFolderId)!;
    const concurrency = Math.max(1, Number(parseArg('concurrency', '8')) || 8);
    const maxDepth = Number(parseArg('depth', '0')) || 0; // 0 = bez limitu
    const outPath = path.resolve(parseArg('out', 'gd-perm-blockers.csv')!);

    console.log('[perms] Autoryzacja...');
    const auth = await getAuth();
    const drive = google.drive({ version: 'v3', auth });

    console.log(`[perms] Skanuję ${rootId}${maxDepth ? ` (głębokość ${maxDepth})` : ''}`);

    let files = 0,
        folders = 0,
        ownFiles = 0,
        foreignFiles = 0,
        foreignFolders = 0,
        cantCopy = 0,
        cantMove = 0,
        inaccessible = 0,
        scanned = 0;
    const problems: Problem[] = [];
    const byOwnerBlocked = new Map<string, number>();

    type Job = { id: string; depth: number; path: string[] };
    const queue: Job[] = [{ id: rootId, depth: 0, path: [] }];

    // Liczba workerów aktualnie przetwarzających zadanie. Potrzebna, bo kolejka
    // BFS bywa CHWILOWO pusta, mimo że pracujący workerzy zaraz do niej dopiszą.
    // Bez tego worker kończyłby się przy pierwszej pustej kolejce i cała
    // współbieżność degradowała się do jednego wątku.
    let activeWorkers = 0;

    async function worker() {
        while (true) {
            const job = queue.shift();
            if (!job) {
                if (activeWorkers === 0) return; // nikt już nic nie dopisze
                await sleep(50);
                continue;
            }
            activeWorkers++;
            let children: drive_v3.Schema$File[];
            try {
                children = await listChildren(drive, job.id);
            } catch {
                inaccessible++;
                continue;
            } finally {
                activeWorkers--;
            }
            scanned++;
            if (scanned % 25 === 0)
                process.stdout.write(
                    `\r[perms] folderów: ${scanned}, kolejka: ${queue.length}, blokerów: ${problems.length}, ponowień: ${retryCount}`
                );

            for (const f of children) {
                const isFolder = f.mimeType === FOLDER;
                const own = f.ownedByMe === true;
                const owner = own
                    ? '(master)'
                    : (f.owners?.[0]?.emailAddress || '(nieznany)').toLowerCase();
                if (isFolder) folders++;
                else files++;

                // canCopy sprawdzamy dla WSZYSTKICH plików, także własnych —
                // Google blokuje kopiowanie map My Maps i plików aplikacji
                // zewnętrznych NIEZALEŻNIE od właściciela. Wcześniej ten
                // warunek siedział pod `if (!own)` i takie pliki umykały.
                const canCopyAll = f.capabilities?.canCopy;
                if (own && !isFolder && canCopyAll === false) {
                    cantCopy++;
                    byOwnerBlocked.set(
                        owner,
                        (byOwnerBlocked.get(owner) ?? 0) + 1
                    );
                    if (problems.length < 20000)
                        problems.push({
                            id: f.id!,
                            name: f.name || '',
                            kind: 'plik',
                            owner,
                            canCopy: 'false',
                            canMove: String(
                                f.capabilities?.canMoveItemWithinDrive
                            ),
                            pathStr: '/' + job.path.join('/'),
                        });
                }

                if (!own) {
                    if (isFolder) foreignFolders++;
                    else foreignFiles++;

                    const canCopy = f.capabilities?.canCopy;
                    const canMove = f.capabilities?.canMoveItemWithinDrive;
                    // folderów i tak nie kopiujemy (tworzymy zamienniki),
                    // ale MUSIMY je umieć przenieść do archiwum
                    const copyProblem = !isFolder && canCopy === false;
                    const moveProblem = canMove === false;
                    if (copyProblem) cantCopy++;
                    if (moveProblem) cantMove++;
                    if (copyProblem || moveProblem) {
                        byOwnerBlocked.set(
                            owner,
                            (byOwnerBlocked.get(owner) ?? 0) + 1
                        );
                        if (problems.length < 20000)
                            problems.push({
                                id: f.id!,
                                name: f.name || '',
                                kind: isFolder ? 'folder' : 'plik',
                                owner,
                                canCopy: String(canCopy),
                                canMove: String(canMove),
                                pathStr: '/' + job.path.join('/'),
                            });
                    }
                } else if (!isFolder) ownFiles++;

                if (isFolder && (maxDepth === 0 || job.depth + 1 < maxDepth))
                    queue.push({
                        id: f.id!,
                        depth: job.depth + 1,
                        path: [...job.path, f.name || '?'],
                    });
            }
        }
    }

    await Promise.all(Array.from({ length: concurrency }, worker));
    console.log();

    console.log('\n=== SKAN UPRAWNIEŃ ===');
    console.log(`  Przeskanowanych folderów:  ${scanned}`);
    console.log(`  Plików:                    ${files}  (własnych mastera: ${ownFiles})`);
    console.log(`  Folderów:                  ${folders}`);
    console.log(`  Cudzych plików:            ${foreignFiles}`);
    console.log(`  Cudzych folderów:          ${foreignFolders}`);
    if (inaccessible)
        console.log(`  ⚠ Folderów bez dostępu:    ${inaccessible}`);
    console.log(
        `  Ponowień (dławienie API):  ${retryCount}` +
            (retryCount > scanned * 0.1
                ? '  ← dużo: zmniejsz --concurrency'
                : '')
    );
    console.log('  ---');
    console.log(
        `  ❌ NIE DA SIĘ SKOPIOWAĆ:   ${cantCopy}  (plik nie trafi na Shared Drive)`
    );
    console.log(
        `  ⛔ NIE DA SIĘ PRZENIEŚĆ:   ${cantMove}  (oryginał zostanie w drzewie i ZABLOKUJE drag)`
    );

    if (byOwnerBlocked.size) {
        console.log('\n=== BLOKERY WG WŁAŚCICIELA ===');
        for (const [owner, n] of [...byOwnerBlocked.entries()].sort(
            (a, b) => b[1] - a[1]
        ))
            console.log(`  ${String(n).padStart(7)}  ${owner}`);
        console.log(
            '\n  (tokeny tych kont eliminują problem — transfer nie wymaga canCopy/canMove)'
        );
    }

    if (problems.length) {
        const esc = (s: string) =>
            /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        writeFileSync(
            outPath,
            [
                'id,name,kind,owner,canCopy,canMoveItemWithinDrive,path,url',
                ...problems.map((p) =>
                    [
                        p.id,
                        p.name,
                        p.kind,
                        p.owner,
                        p.canCopy,
                        p.canMove,
                        p.pathStr,
                        'https://drive.google.com/open?id=' + p.id,
                    ]
                        .map(esc)
                        .join(',')
                ),
            ].join('\n'),
            'utf8'
        );
        console.log(`\n[perms] CSV blokerów: ${outPath}`);
    }

    console.log(
        cantCopy === 0 && cantMove === 0
            ? '\n[perms] ✅ WERDYKT: master ma pełne prawa — całe drzewo da się przejąć.'
            : '\n[perms] ⚠ WERDYKT: są blokery — patrz CSV. Rozwiązanie: token właściciela albo ręczne nadanie uprawnień.'
    );
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[perms] Błąd:', err.message || err);
        process.exit(1);
    });
