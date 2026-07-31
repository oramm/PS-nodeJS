/**
 * ROZMIAR i LICZBA ELEMENTÓW folderu Google Drive (rekurencyjnie).
 *
 * Drive API nie zwraca rozmiaru folderu wprost — skrypt przechodzi całe drzewo
 * i sumuje pole `size` plików. Listuje WSZYSTKIE pliki w folderach, niezależnie
 * od właściciela (o ile konto z tokenem ma do nich dostęp), więc pliki dodane
 * przez inne osoby też są liczone. Wynik zawiera rozbicie wg właściciela.
 *
 * W 100% READ-ONLY (tylko drive.files.list).
 *
 * Uwaga:
 *   - Pliki natywne Google (Dokumenty/Arkusze) NIE mają pola `size` — liczone są
 *     tylko jako sztuki (kolumna nativeCount), nie w bajtach.
 *   - Skróty nie są rozwijane (nie liczymy celu skrótu, unikamy pętli).
 *
 * Użycie:
 *   yarn gd:folder-size                              # domyślnie Setup.Gd.rootFolderId
 *   yarn gd:folder-size --folderId <ID>
 *   yarn gd:folder-size --concurrency 6              # łagodniej dla API (domyślnie 8)
 *   yarn gd:folder-size --out owners.csv             # CSV z rozbiciem wg właściciela
 *
 * Wymaga .env.development z REFRESH_TOKEN i poświadczeniami GD.
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import { google, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { oAuthClient } from '../setup/Sessions/ToolsGapi';
import Setup from '../setup/Setup';
import { writeFileSync } from 'fs';
import path from 'path';

function parseArg(name: string, defaultValue?: string): string | undefined {
    const args = process.argv.slice(2);
    const index = args.findIndex((arg) => arg === `--${name}`);
    if (index === -1) return defaultValue;
    const next = args[index + 1];
    if (next === undefined || next.startsWith('--')) return 'true';
    return next;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';

async function getAuth(): Promise<OAuth2Client> {
    const refreshToken = process.env.REFRESH_TOKEN;
    if (!refreshToken) throw new Error('Brak REFRESH_TOKEN w .env');
    oAuthClient.setCredentials({ refresh_token: refreshToken });
    const tokens = await oAuthClient.getAccessToken();
    if (!tokens.token)
        throw new Error('Nie udało się pobrać access tokenu z Google');
    return oAuthClient;
}

function getErrorReason(err: any): string {
    return (
        err?.response?.data?.error?.errors?.[0]?.reason ??
        err?.errors?.[0]?.reason ??
        ''
    );
}
/** Błędy sieciowe — bez kodu HTTP, ale przejściowe (uśpienie komputera,
 *  chwilowy brak sieci). Bez ich ponawiania długie przebiegi gubią dane. */
const NETWORK_ERRORS = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ENOTFOUND',
    'EAI_AGAIN',
    'EPIPE',
    'ENETUNREACH',
    'EHOSTUNREACH',
];
function isRetryable(err: any): boolean {
    const code = err?.response?.status ?? err?.code;
    const reason = getErrorReason(err);
    if (typeof code === 'string' && NETWORK_ERRORS.includes(code)) return true;
    const msg = String(err?.message ?? '');
    if (NETWORK_ERRORS.some((e) => msg.includes(e))) return true;
    if (/socket hang up|network|timeout/i.test(msg)) return true;
    if (code === 429 || code === 500 || code === 503) return true;
    if (code === 403 && /rateLimit|userRateLimit/i.test(reason)) return true;
    return false;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Listuje wszystkie dzieci folderu (ze stronicowaniem i backoffem). */
async function listChildren(
    drive: drive_v3.Drive,
    folderId: string
): Promise<drive_v3.Schema$File[]> {
    const out: drive_v3.Schema$File[] = [];
    let pageToken: string | undefined;
    do {
        let attempt = 0;
        // retry pojedynczej strony
        // eslint-disable-next-line no-constant-condition
        while (true) {
            try {
                const res = await drive.files.list({
                    q: `'${folderId}' in parents and trashed = false`,
                    fields: 'nextPageToken, files(id, name, mimeType, size, ownedByMe, owners(emailAddress))',
                    pageSize: 1000,
                    pageToken,
                    supportsAllDrives: true,
                    includeItemsFromAllDrives: true,
                });
                out.push(...(res.data.files ?? []));
                pageToken = res.data.nextPageToken ?? undefined;
                break;
            } catch (err: any) {
                if (isRetryable(err) && attempt < 6) {
                    const backoff =
                        Math.min(2 ** attempt * 500, 16000) +
                        Math.floor(Math.random() * 400);
                    attempt++;
                    await sleep(backoff);
                    continue;
                }
                throw err;
            }
        }
    } while (pageToken);
    return out;
}

type OwnerStat = {
    bytes: number;
    files: number;
    native: number;
    folders: number;
    shortcuts: number;
};

async function main() {
    const folderId = parseArg('folderId', Setup.Gd.rootFolderId)!;
    const concurrency = Math.max(1, Number(parseArg('concurrency', '8')) || 8);
    const outArg = parseArg('out');

    console.log('[size] Autoryzacja Google Drive...');
    const auth = await getAuth();
    const drive = google.drive({ version: 'v3', auth });

    console.log(`[size] Skanowanie folderu: ${folderId}`);
    console.log('[size] (rekurencyjnie, to może potrwać przy dużym drzewie)');

    let totalBytes = 0;
    let fileCount = 0; // pliki binarne (z rozmiarem)
    let nativeCount = 0; // pliki natywne Google (bez rozmiaru)
    let shortcutCount = 0;
    let folderCount = 0;
    let inaccessibleFolders = 0;
    const byOwner = new Map<string, OwnerStat>();

    const addOwner = (email: string, patch: Partial<OwnerStat>) => {
        const cur = byOwner.get(email) ?? {
            bytes: 0,
            files: 0,
            native: 0,
            folders: 0,
            shortcuts: 0,
        };
        cur.bytes += patch.bytes ?? 0;
        cur.files += patch.files ?? 0;
        cur.native += patch.native ?? 0;
        cur.folders += patch.folders ?? 0;
        cur.shortcuts += patch.shortcuts ?? 0;
        byOwner.set(email, cur);
    };

    // BFS z pulą workerów listujących foldery
    const queue: string[] = [folderId];
    let processedFolders = 0;

    // patrz komentarz w gd-scan-permissions: kolejka BFS bywa chwilowo pusta,
    // mimo że pracujący workerzy zaraz do niej dopiszą kolejne foldery
    let activeWorkers = 0;

    async function worker() {
        while (true) {
            const current = queue.shift();
            if (current === undefined) {
                if (activeWorkers === 0) return;
                await sleep(50);
                continue;
            }
            activeWorkers++;
            let children: drive_v3.Schema$File[];
            try {
                children = await listChildren(drive, current);
            } catch (err: any) {
                inaccessibleFolders++;
                continue;
            } finally {
                activeWorkers--;
            }
            processedFolders++;
            if (processedFolders % 25 === 0)
                process.stdout.write(
                    `\r[size] przeskanowano folderów: ${processedFolders}, kolejka: ${queue.length}`
                );

            for (const f of children) {
                const owner =
                    f.ownedByMe === true
                        ? '(konto z tokenem)'
                        : f.owners?.[0]?.emailAddress ?? '(nieznany)';

                if (f.mimeType === FOLDER_MIME) {
                    folderCount++;
                    addOwner(owner, { folders: 1 });
                    if (f.id) queue.push(f.id);
                } else if (f.mimeType === SHORTCUT_MIME) {
                    shortcutCount++;
                    addOwner(owner, { shortcuts: 1 });
                } else if (f.size) {
                    const bytes = Number(f.size) || 0;
                    totalBytes += bytes;
                    fileCount++;
                    addOwner(owner, { bytes, files: 1 });
                } else {
                    // plik natywny Google (brak size)
                    nativeCount++;
                    addOwner(owner, { native: 1 });
                }
            }
        }
    }

    await Promise.all(
        Array.from({ length: concurrency }, worker)
    );
    console.log();

    const totalItems =
        fileCount + nativeCount + shortcutCount + folderCount;
    const fmtGB = (b: number) => (b / 1024 ** 3).toFixed(2);
    const fmtMB = (b: number) => (b / 1024 ** 2).toFixed(1);

    console.log('\n=== ROZMIAR FOLDERU ===');
    console.log(`  Folder główny:       ${folderId}`);
    console.log(
        `  Rozmiar (pliki):     ${fmtGB(totalBytes)} GB  (${fmtMB(
            totalBytes
        )} MB)`
    );
    console.log('  ---');
    console.log(`  Pliki z rozmiarem:   ${fileCount}`);
    console.log(`  Pliki natywne Google:${nativeCount}  (bez wpływu na bajty)`);
    console.log(`  Skróty:              ${shortcutCount}`);
    console.log(`  Podfoldery:          ${folderCount}`);
    console.log(`  RAZEM elementów:     ${totalItems}  (limit Shared Drive: 500 000)`);
    if (inaccessibleFolders > 0)
        console.log(
            `  ⚠️ Folderów bez dostępu (pominięto): ${inaccessibleFolders}`
        );

    // rozbicie wg właściciela — posortowane po bajtach
    const owners = Array.from(byOwner.entries()).sort(
        (a, b) => b[1].bytes - a[1].bytes
    );
    console.log('\n=== ROZBICIE WG WŁAŚCICIELA ===');
    for (const [email, s] of owners) {
        const pct = totalBytes ? ((s.bytes / totalBytes) * 100).toFixed(1) : '0';
        console.log(
            `  ${email.padEnd(30)}  ${fmtGB(s.bytes).padStart(8)} GB  (${pct}%)` +
                `  pliki=${s.files}  natywne=${s.native}` +
                `  FOLDERY=${s.folders}  skróty=${s.shortcuts}`
        );
    }

    if (outArg) {
        const outPath = path.resolve(outArg);
        const header = 'owner,bytes,GB,files,nativeFiles,folders,shortcuts';
        const lines = owners.map(
            ([email, s]) =>
                `"${email}",${s.bytes},${fmtGB(s.bytes)},${s.files},${s.native},${s.folders},${s.shortcuts}`
        );
        writeFileSync(outPath, [header, ...lines].join('\n'), 'utf8');
        console.log(`\n[size] CSV rozbicia zapisano: ${outPath}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[size] Błąd:', err);
        process.exit(1);
    });
