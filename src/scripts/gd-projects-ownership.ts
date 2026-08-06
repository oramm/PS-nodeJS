/**
 * WŁASNOŚĆ WG PROJEKTU — dla każdego folderu w korzeniu sprawdza, czy zawiera
 * obiekty należące do kogoś innego niż konto z REFRESH_TOKEN (master).
 *
 * Odpowiada na pytanie zadawane przed każdym etapem migracji:
 *   - czy ten projekt w ogóle wymaga przejęcia własności,
 *   - czy da się go przejąć TRANSFEREM (mamy token właściciela → ID zostają),
 *     czy trzeba KOPIOWAĆ (brak tokenu → nowe ID → reindeks bazy).
 *
 * W 100% READ-ONLY (tylko drive.files.list).
 *
 * Użycie:
 *   yarn gd:projects-ownership
 *   yarn gd:projects-ownership --root <FOLDER_ID>
 *   yarn gd:projects-ownership --tokens tokens.json --concurrency 20
 *   yarn gd:projects-ownership --only-foreign      # tylko projekty z cudzymi obiektami
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import { google, drive_v3 } from 'googleapis';
import { oAuthClient } from '../setup/Sessions/ToolsGapi';
import Setup from '../setup/Setup';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

function arg(name: string, def?: string): string | undefined {
    const a = process.argv.slice(2);
    const i = a.findIndex((x) => x === `--${name}`);
    if (i === -1) return def;
    const n = a[i + 1];
    if (n === undefined || n.startsWith('--')) return 'true';
    return n;
}
const flag = (n: string) => process.argv.slice(2).includes(`--${n}`);

function outPath(name: string): string {
    if (path.isAbsolute(name) || name.includes('/') || name.includes('\\'))
        return name;
    const dir = arg('outdir', 'gd-out')!;
    mkdirSync(dir, { recursive: true });
    return path.join(dir, name);
}

const FOLDER = 'application/vnd.google-apps.folder';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const NETWORK_ERRORS = [
    'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND',
    'EAI_AGAIN', 'EPIPE', 'ENETUNREACH', 'EHOSTUNREACH',
];
function reason(err: any): string {
    return (
        err?.response?.data?.error?.errors?.[0]?.reason ??
        err?.errors?.[0]?.reason ?? ''
    );
}
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
let retries = 0;
async function withRetry<T>(fn: () => Promise<T>, max = 10): Promise<T> {
    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (err: any) {
            if (retryable(err) && attempt < max) {
                retries++;
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
                fields: 'nextPageToken, files(id,name,mimeType,ownedByMe,owners(emailAddress))',
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

type Proj = {
    name: string;
    id: string;
    items: number;
    master: number;
    byOwner: Map<string, number>;
    errors: number;
};

async function main() {
    const rootId = arg('root', Setup.Gd.rootFolderId)!;
    const concurrency = Math.max(1, Number(arg('concurrency', '20')) || 20);
    const tokensFile = arg('tokens', 'tokens.json')!;
    const onlyForeign = flag('only-foreign');

    // konta, dla których MAMY token — decydują o transfer vs copy
    const haveToken = new Set<string>();
    if (existsSync(tokensFile)) {
        const raw = JSON.parse(readFileSync(tokensFile, 'utf8'));
        const list = Array.isArray(raw)
            ? raw.map((t: any) => t.email)
            : Object.keys(raw);
        list.forEach((e: string) => haveToken.add(e.toLowerCase()));
    }

    oAuthClient.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });
    await oAuthClient.getAccessToken();
    const drive = google.drive({ version: 'v3', auth: oAuthClient });
    const me = (await drive.about.get({ fields: 'user(emailAddress)' })).data.user
        ?.emailAddress!;
    haveToken.add(me.toLowerCase());

    console.log(`[own] Master (REFRESH_TOKEN): ${me}`);
    console.log(`[own] Kont z tokenem: ${haveToken.size}`);
    console.log(`[own] Korzeń: ${rootId}`);

    // Na dysku współdzielonym własność nie istnieje — `ownedByMe` jest zawsze
    // false, więc raport pokazałby wszystko jako "obce". Setup.Gd.rootFolderId
    // wskazuje już nowy dysk docelowy, łatwo o pomyłkę.
    const rootMeta = await withRetry(() =>
        drive.files.get({
            fileId: rootId,
            fields: 'name,driveId',
            supportsAllDrives: true,
        })
    );
    if (rootMeta.data.driveId) {
        console.warn(
            `\n[own] ⚠ To DYSK WSPÓŁDZIELONY ("${rootMeta.data.name}").\n` +
                `   Tam własność per-obiekt nie istnieje i raport nie ma sensu.\n` +
                `   Podaj produkcyjny korzeń: --root <ID folderu w Moim Dysku>\n`
        );
    }
    console.log(`[own] Skanuję projekty...\n`);

    const roots = (await listChildren(drive, rootId)).filter(
        (f) => f.mimeType === FOLDER
    );
    const projects: Proj[] = roots.map((f) => ({
        name: f.name ?? '(bez nazwy)',
        id: f.id!,
        items: 0,
        master: 0,
        byOwner: new Map(),
        errors: 0,
    }));
    console.log(`[own] Projektów w korzeniu: ${projects.length}\n`);

    // wspólna pula workerów; każde zadanie wie, do którego projektu doliczyć
    const queue: Array<{ folderId: string; p: Proj }> = projects.map((p) => ({
        folderId: p.id,
        p,
    }));
    let active = 0;
    let doneFolders = 0;

    async function worker() {
        while (true) {
            const job = queue.shift();
            if (!job) {
                if (active === 0) return;
                await sleep(50);
                continue;
            }
            active++;
            try {
                const children = await listChildren(drive, job.folderId);
                for (const c of children) {
                    job.p.items++;
                    const owner = c.ownedByMe
                        ? me
                        : (c.owners?.[0]?.emailAddress ?? '(nieznany)');
                    if (owner.toLowerCase() === me.toLowerCase()) job.p.master++;
                    else
                        job.p.byOwner.set(
                            owner,
                            (job.p.byOwner.get(owner) ?? 0) + 1
                        );
                    if (c.mimeType === FOLDER)
                        queue.push({ folderId: c.id!, p: job.p });
                }
            } catch {
                job.p.errors++;
            } finally {
                active--;
                doneFolders++;
                if (doneFolders % 200 === 0 && process.stdout.isTTY)
                    process.stdout.write(
                        `\r[own] folderów: ${doneFolders}  kolejka: ${queue.length}`
                    );
            }
        }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    console.log();

    // ---------- RAPORT ----------
    const rows = projects
        .map((p) => {
            let withTok = 0;
            let noTok = 0;
            const noTokOwners: string[] = [];
            for (const [o, n] of p.byOwner) {
                if (haveToken.has(o.toLowerCase())) withTok += n;
                else {
                    noTok += n;
                    noTokOwners.push(`${o}(${n})`);
                }
            }
            const foreign = withTok + noTok;
            return { p, foreign, withTok, noTok, noTokOwners };
        })
        .sort((a, b) => b.foreign - a.foreign);

    console.log(
        '\n' +
            'PROJEKT'.padEnd(42) +
            'RAZEM'.padStart(8) +
            'MASTER'.padStart(8) +
            'OBCE'.padStart(7) +
            '  TRANSFER'.padStart(10) +
            '  KOPIA'.padStart(8) +
            '   CZY OBCE'
    );
    console.log('-'.repeat(100));
    let tItems = 0, tForeign = 0, tWith = 0, tNo = 0, nForeign = 0;
    for (const r of rows) {
        tItems += r.p.items;
        tForeign += r.foreign;
        tWith += r.withTok;
        tNo += r.noTok;
        if (r.foreign > 0) nForeign++;
        if (onlyForeign && r.foreign === 0) continue;
        console.log(
            r.p.name.slice(0, 40).padEnd(42) +
                String(r.p.items).padStart(8) +
                String(r.p.master).padStart(8) +
                String(r.foreign).padStart(7) +
                String(r.withTok).padStart(10) +
                String(r.noTok).padStart(8) +
                (r.foreign === 0
                    ? '   NIE — gotowy'
                    : r.noTok === 0
                      ? '   tak, same transfery'
                      : '   TAK + KOPIE → reindeks') +
                (r.p.errors ? `  ⚠${r.p.errors} bł.` : '')
        );
    }
    console.log('-'.repeat(100));
    console.log(
        'RAZEM'.padEnd(42) +
            String(tItems).padStart(8) +
            String(tItems - tForeign).padStart(8) +
            String(tForeign).padStart(7) +
            String(tWith).padStart(10) +
            String(tNo).padStart(8)
    );
    console.log(
        `\n[own] Projektów z cudzymi obiektami: ${nForeign} z ${projects.length}` +
            `\n[own] Projektów gotowych (sama własność mastera): ${projects.length - nForeign}` +
            `\n[own] Ponowienia API: ${retries}`
    );

    const csv = [
        'projekt,folderId,razem,master,obce,transfer,kopia,wlascicieleBezTokenu',
        ...rows.map(
            (r) =>
                `"${r.p.name.replace(/"/g, '""')}",${r.p.id},${r.p.items},${r.p.master},` +
                `${r.foreign},${r.withTok},${r.noTok},"${r.noTokOwners.join('; ')}"`
        ),
    ].join('\n');
    const csvPath = outPath('gd-projekty-wlasnosc.csv');
    writeFileSync(csvPath, csv, 'utf8');
    console.log(`[own] CSV: ${csvPath}`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[own] Błąd:', err.message || err);
        process.exit(1);
    });
