/**
 * KOPIA ZAPASOWA drzewa Google Drive (czysto addytywna).
 *
 * Odtwarza strukturę folderów i kopiuje KAŻDY plik ze źródła do folderu
 * docelowego (np. na zapasowym Dysku współdzielonym).
 *
 * ⚠ GWARANCJA BEZPIECZEŃSTWA: skrypt NIE MODYFIKUJE ŹRÓDŁA.
 * Używa wyłącznie: files.list, files.get (odczyt) oraz files.create, files.copy
 * (tworzenie w miejscu docelowym). Nie ma tu ani jednego files.update ani
 * files.delete — źródło jest technicznie nietykalne.
 *
 * Tryby:
 *   (domyślny)  — kopiowanie; `--dry-run` jest domyślne, realny przebieg z `--apply`
 *   --verify    — porównuje drzewo źródłowe z kopią i wypisuje, czego brakuje
 *
 * Manifest `gd-backup-manifest.jsonl` zapisywany PRZYROSTOWO (odporny na awarię)
 * służy też do wznawiania: pozycje już skopiowane są pomijane.
 *
 * UŻYCIE:
 *   # 1. podgląd (nic nie robi)
 *   yarn gd:backup --source <ID_PROJEKTU> --target <ID_FOLDERU_KOPII>
 *
 *   # 2. wykonanie
 *   yarn gd:backup --source <ID> --target <ID> --apply --concurrency 10
 *
 *   # 3. weryfikacja kompletności
 *   yarn gd:backup --source <ID> --target <ID> --verify
 *
 * Wymaga .env z REFRESH_TOKEN (konto master).
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import { google, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { oAuthClient } from '../setup/Sessions/ToolsGapi';
import {
    appendFileSync,
    readFileSync,
    existsSync,
    writeFileSync,
    mkdirSync,
} from 'fs';
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

const FOLDER = 'application/vnd.google-apps.folder';
const SHORTCUT = 'application/vnd.google-apps.shortcut';
/** Domyślny manifest; nadpisywalny przez --manifest (osobny na każdą kopię). */
const DEFAULT_MANIFEST = 'gd-backup-manifest.jsonl';

/**
 * Katalog na raporty (manifesty, snapshoty, listy błędów). Domyślnie `gd-out`,
 * zmienialny przez --outdir. Trzymany poza gitem — to artefakty operacyjne.
 * Nazwa zawierająca separator lub ścieżka absolutna są używane bez zmian.
 */
function outPath(name: string): string {
    if (path.isAbsolute(name) || name.includes('/') || name.includes('\\'))
        return name;
    const dir = arg('outdir', 'gd-out')!;
    mkdirSync(dir, { recursive: true });
    return path.join(dir, name);
}

/** Postęp wypisywany tylko na terminal. Przy przekierowaniu do pliku znak
 * powrotu karetki nie nadpisuje linii i log rośnie do megabajtów. */
function progress(text: string) {
    if (process.stdout.isTTY) process.stdout.write(text);
}


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
                    'nextPageToken, files(id,name,mimeType,size,owners(emailAddress),' +
                    'shortcutDetails(targetId),capabilities(canCopy),createdTime)',
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

/** src -> dst z manifestu (wznawianie i idempotencja) */
function loadManifest(path: string): Map<string, string> {
    const m = new Map<string, string>();
    if (!existsSync(path)) return m;
    for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
            const o = JSON.parse(line);
            if (o.src && o.dst) m.set(o.src, o.dst);
        } catch {}
    }
    return m;
}

// ---------------- KOPIOWANIE ----------------
type Job =
    | { kind: 'folder'; srcId: string; dstId: string; path: string }
    | {
          kind: 'file';
          srcId: string;
          name: string;
          dstId: string;
          path: string;
          isShortcut: boolean;
          targetId?: string;
      };

/** Parametry trybów — z argv albo podane wprost (tryb wsadowy). */
type ModeOpts = {
    source?: string;
    target?: string;
    manifest?: string;
    out?: string;
    apply?: boolean;
    concurrency?: number;
    /** ISO. Obiekty w źródle utworzone PO tym czasie powstały już w trakcie
     *  kopiowania — weryfikacja nie liczy ich jako braków. */
    since?: string;
    /** snapshot z chwili kopiowania — punkt odniesienia dla weryfikacji */
    snapshotFile?: string;
};

async function backupMode(drive: drive_v3.Drive, opts: ModeOpts = {}) {
    const source = opts.source ?? arg('source');
    const target = opts.target ?? arg('target');
    if (!source || !target) throw new Error('Podaj --source i --target.');
    // zawężone kopie — funkcje niżej są hoistowane, więc TS nie widzi tam guardu
    const srcRoot: string = source;
    const tgtRoot: string = target;
    const apply = opts.apply ?? flag('apply');
    const concurrency =
        opts.concurrency ?? Math.max(1, Number(arg('concurrency', '10')) || 10);

    const manifestPath = outPath(opts.manifest ?? arg('manifest', DEFAULT_MANIFEST)!);
    const done = loadManifest(manifestPath);
    /** niepusty manifest = wznawiamy przerwany przebieg (patrz doFolder) */
    const resuming = done.size > 0;
    console.log(
        `[backup] ${apply ? 'APPLY' : 'DRY-RUN'}  źródło=${source} → kopia=${target}` +
            `\n[backup] Współbieżność: ${concurrency}  |  manifest: ${manifestPath}` +
            (done.size
                ? `\n[backup] Manifest zawiera ${done.size} pozycji — ZOSTANĄ POMINIĘTE.` +
                  `\n[backup] Jeśli to NOWA kopia (inny cel), użyj --manifest <inny-plik>!`
                : '') +
            `\n[backup] ŹRÓDŁO NIE JEST MODYFIKOWANE (tylko odczyt + tworzenie w kopii)\n`
    );

    const stat = {
        folders: 0,
        files: 0,
        shortcuts: 0,
        brokenShortcuts: 0,
        skipped: 0,
        cantCopy: 0,
        errors: 0,
        bytes: 0,
    };
    const failures: string[] = [];
    /** skróty w źródle wskazujące na usunięte pliki — nie do skopiowania */
    const brokenList: string[] = [];

    const queue: Job[] = [];
    let activeWorkers = 0;

    function record(src: string, dst: string, kind: string, path: string) {
        done.set(src, dst);
        if (apply)
            appendFileSync(
                manifestPath,
                JSON.stringify({ src, dst, kind, path }) + '\n',
                'utf8'
            );
    }

    /**
     * Tworzy w archiwum FOLDER PROJEKTU i zwraca jego id. Bez tego zawartość
     * źródła trafiałaby luzem do --target i projekty mieszałyby się ze sobą.
     * Rejestruje go w manifeście, dzięki czemu --verify sam go znajdzie.
     */
    async function ensureRootFolder(): Promise<string> {
        const srcId = srcRoot;
        const tgtId = tgtRoot;
        const existing = done.get(srcId);
        if (existing) {
            console.log(`[backup] Folder projektu w archiwum: ${existing} (z manifestu)`);
            return existing;
        }
        const meta = await withRetry(() =>
            drive.files.get({
                fileId: srcId,
                fields: 'id,name',
                supportsAllDrives: true,
            })
        );
        const name = meta.data.name ?? 'projekt';
        if (!apply) {
            console.log(`[backup] Utworzyłbym folder projektu "${name}" w ${tgtId}`);
            return `dry:${srcId}`;
        }
        const res = await withRetry(() =>
            drive.files.create({
                requestBody: { name, parents: [tgtId], mimeType: FOLDER },
                fields: 'id',
                supportsAllDrives: true,
            })
        );
        const id = res.data.id!;
        record(srcId, id, 'folder', `/${name}`);
        stat.folders++;
        console.log(`[backup] Folder projektu "${name}" → ${id}`);
        return id;
    }

    async function worker() {
        while (true) {
            const job = queue.shift();
            if (!job) {
                if (activeWorkers === 0) return;
                await sleep(50);
                continue;
            }
            activeWorkers++;
            try {
                if (job.kind === 'folder') await doFolder(job);
                else await doFile(job);
            } catch (err: any) {
                stat.errors++;
                const msg = `${job.path}/${job.kind === 'file' ? job.name : ''}: ${err.message} ${reason(err)}`;
                failures.push(msg);
                console.error(`  ✗ ${msg}`);
            } finally {
                activeWorkers--;
            }
            if ((stat.folders + stat.files) % 50 === 0)
                progress(
                    `\r[backup] foldery: ${stat.folders}, pliki: ${stat.files}, pominięte: ${stat.skipped}, błędy: ${stat.errors}, ponowienia: ${retryCount}   `
                );
        }
    }

    async function doFolder(job: Job & { kind: 'folder' }) {
        const children = await listChildren(drive, job.srcId);

        /**
         * WZNAWIANIE: manifest zapisujemy PO utworzeniu obiektu, więc przerwanie
         * procesu może zostawić obiekty utworzone, ale nieodnotowane. Przy
         * wznowieniu listujemy folder docelowy RAZ i dopasowujemy po nazwie —
         * dzięki temu nie powstają duplikaty ani osierocone poddrzewa.
         * Świeży przebieg (pusty manifest) pomija ten koszt całkowicie.
         */
        let existing: Map<
            string,
            Array<{ id: string; isFolder: boolean; size: number }>
        > | null = null;
        if (resuming && apply) {
            existing = new Map();
            for (const e of await listChildren(drive, job.dstId)) {
                const list = existing.get(e.name ?? '') ?? [];
                list.push({
                    id: e.id!,
                    isFolder: e.mimeType === FOLDER,
                    size: Number(e.size) || 0,
                });
                existing.set(e.name ?? '', list);
            }
        }
        /**
         * Zwraca istniejący odpowiednik i "zużywa" go.
         * Dla plików BINARNYCH wymaga też zgodności ROZMIARU — bez tego nowy
         * plik podstawiony pod tę samą nazwę (np. poprawiona wersja rysunku)
         * byłby uznany za już skopiowany. Dla plików natywnych Google rozmiar
         * kopii z zasady różni się od oryginału, więc tam porównujemy po nazwie.
         */
        const takeExisting = (
            name: string,
            wantFolder: boolean,
            size?: number,
            isNative = false
        ) => {
            const list = existing?.get(name);
            if (!list) return undefined;
            const i = list.findIndex(
                (x) =>
                    x.isFolder === wantFolder &&
                    (wantFolder ||
                        isNative ||
                        size === undefined ||
                        x.size === size)
            );
            if (i === -1) return undefined;
            return list.splice(i, 1)[0].id;
        };

        // PIERWSZEŃSTWO MANIFESTU: obiekty znane po ID najpierw "zużywają" swoje
        // odpowiedniki w archiwum. Bez tego nowy plik o tej samej nazwie mógłby
        // (zależnie od kolejności listowania) przejąć cudzy odpowiednik
        // i zostać uznany za już skopiowany.
        if (existing)
            for (const c of children)
                if (done.has(c.id!))
                    takeExisting(
                        c.name ?? '',
                        c.mimeType === FOLDER,
                        Number(c.size) || 0,
                        String(c.mimeType ?? '').startsWith(
                            'application/vnd.google-apps'
                        )
                    );

        for (const c of children) {
            const childPath = `${job.path}/${c.name ?? '?'}`;
            if (c.mimeType === FOLDER) {
                const already = done.get(c.id!);
                if (already) {
                    stat.skipped++;
                    queue.push({
                        kind: 'folder',
                        srcId: c.id!,
                        dstId: already,
                        path: childPath,
                    });
                    continue;
                }
                let newId = `dry:${c.id}`;
                if (apply) {
                    const reuse = takeExisting(c.name ?? '', true);
                    if (reuse) {
                        // folder powstał w przerwanym przebiegu — używamy go
                        newId = reuse;
                        stat.skipped++;
                        record(c.id!, newId, 'folder', childPath);
                        queue.push({
                            kind: 'folder',
                            srcId: c.id!,
                            dstId: newId,
                            path: childPath,
                        });
                        continue;
                    }
                    stat.folders++;
                    const res = await withRetry(() =>
                        drive.files.create({
                            requestBody: {
                                name: c.name ?? 'bez nazwy',
                                parents: [job.dstId],
                                mimeType: FOLDER,
                            },
                            fields: 'id',
                            supportsAllDrives: true,
                        })
                    );
                    newId = res.data.id!;
                    record(c.id!, newId, 'folder', childPath);
                } else stat.folders++;
                queue.push({
                    kind: 'folder',
                    srcId: c.id!,
                    dstId: newId,
                    path: childPath,
                });
            } else {
                if (done.has(c.id!)) {
                    stat.skipped++; // odpowiednik zużyty w przebiegu wstępnym
                    continue;
                }
                if (c.capabilities?.canCopy === false && c.mimeType !== SHORTCUT) {
                    stat.cantCopy++;
                    failures.push(`NIE DA SIĘ SKOPIOWAĆ: ${childPath}`);
                    continue;
                }
                // przy wznawianiu: plik mógł powstać, zanim trafił do manifestu
                if (
                    existing &&
                    takeExisting(
                        c.name ?? '',
                        false,
                        Number(c.size) || 0,
                        String(c.mimeType ?? '').startsWith('application/vnd.google-apps')
                    )
                ) {
                    stat.skipped++;
                    continue;
                }
                queue.push({
                    kind: 'file',
                    srcId: c.id!,
                    name: c.name ?? 'bez nazwy',
                    dstId: job.dstId,
                    path: childPath,
                    isShortcut: c.mimeType === SHORTCUT,
                    targetId: c.shortcutDetails?.targetId ?? undefined,
                });
                if (c.size) stat.bytes += Number(c.size) || 0;
            }
        }
    }

    async function doFile(job: Job & { kind: 'file' }) {
        if (job.isShortcut) {
            if (apply) {
                try {
                    const res = await withRetry(() =>
                        drive.files.create({
                            requestBody: {
                                name: job.name,
                                parents: [job.dstId],
                                mimeType: SHORTCUT,
                                shortcutDetails: { targetId: job.targetId },
                            },
                            fields: 'id',
                            supportsAllDrives: true,
                        })
                    );
                    record(job.srcId, res.data.id!, 'shortcut', job.path);
                    stat.shortcuts++;
                } catch (err: any) {
                    // Google odmawia utworzenia skrótu do nieistniejącego pliku.
                    // To NIE błąd kopii — skrót w ŹRÓDLE jest zepsuty (jego cel
                    // został usunięty). Nie ma czego backupować.
                    const isBroken =
                        /notFound/i.test(reason(err)) ||
                        /File not found/i.test(err.message || '');
                    if (!isBroken) throw err;
                    stat.brokenShortcuts++;
                    brokenList.push(
                        `${job.path}  → cel ${job.targetId} nie istnieje`
                    );
                }
            } else stat.shortcuts++;
            return;
        }
        stat.files++;
        if (apply) {
            const res = await withRetry(() =>
                drive.files.copy({
                    fileId: job.srcId,
                    requestBody: { name: job.name, parents: [job.dstId] },
                    fields: 'id',
                    supportsAllDrives: true,
                })
            );
            record(job.srcId, res.data.id!, 'file', job.path);
        }
    }

    const startedAt = new Date().toISOString();
    const rootDst = await ensureRootFolder();
    queue.push({ kind: 'folder', srcId: source, dstId: rootDst, path: '' });

    await Promise.all(Array.from({ length: concurrency }, worker));
    console.log();

    const gb = (stat.bytes / 1024 ** 3).toFixed(2);
    console.log('\n=== PODSUMOWANIE KOPII ===');
    console.log(`  Foldery utworzone:     ${stat.folders}`);
    console.log(`  Pliki skopiowane:      ${stat.files}  (${gb} GB)`);
    console.log(`  Skróty odtworzone:     ${stat.shortcuts}`);
    console.log(
        `  ℹ Zepsute skróty w źródle: ${stat.brokenShortcuts}  (cel usunięty — nie ma czego kopiować)`
    );
    console.log(`  Pominięte (manifest):  ${stat.skipped}`);
    console.log(`  ❌ Nie da się skopiować:${stat.cantCopy}`);
    console.log(`  ❌ Błędy:               ${stat.errors}`);
    console.log(`  Ponowienia API:        ${retryCount}`);

    if (brokenList.length) {
        const p = outPath('gd-backup-broken-shortcuts.txt');
        writeFileSync(p, brokenList.join('\n'), 'utf8');
        console.log(`\n[backup] Zepsute skróty (informacyjnie): ${p}`);
    }
    if (failures.length) {
        writeFileSync(
            outPath('gd-backup-failures.txt'),
            failures.join('\n'),
            'utf8'
        );
        console.log(
            `\n[backup] Lista problemów: ${outPath('gd-backup-failures.txt')}`
        );
    }
    if (!apply)
        console.log('\n[backup] To był DRY-RUN. Dodaj --apply, aby wykonać.');
    else if (!opts.source)
        console.log(
            '\n[backup] Teraz zweryfikuj kompletność:\n' +
                `  yarn gd:backup --source ${source} --target ${target} --verify`
        );
    return { ...stat, retries: retryCount, startedAt };
}

// ---------------- WERYFIKACJA ----------------
async function verifyMode(drive: drive_v3.Drive, opts: ModeOpts = {}) {
    const source = opts.source ?? arg('source');
    let target = opts.target ?? arg('target');
    if (!source || !target) throw new Error('Podaj --source i --target.');
    const concurrency =
        opts.concurrency ?? Math.max(1, Number(arg('concurrency', '10')) || 10);

    // Jeśli podano manifest, weź z niego folder projektu w archiwum. Bez tego
    // trzeba by ręcznie wskazywać podfolder, a wskazanie korzenia dysku
    // porównywałoby projekt z CAŁYM archiwum (fałszywe "nadmiarowe").
    const manifestArg = opts.manifest ?? arg('manifest');
    /** src ID -> dst ID; służy też do rozpoznania "skopiowane, potem zmienione" */
    let manifestMap = new Map<string, string>();
    if (manifestArg) {
        const m = loadManifest(outPath(manifestArg));
        manifestMap = m;
        const rootDst = m.get(source);
        if (rootDst) {
            target = rootDst;
            console.log(
                `[verify] Z manifestu: folder projektu w archiwum = ${target}`
            );
        } else {
            console.warn(
                `[verify] ⚠ Manifest nie zawiera wpisu dla ${source} — porównuję z podanym --target.`
            );
        }
    }

    /**
     * ścieżka+rozmiar -> ile razy wystąpiło.
     * Klucz zawiera rozmiar i liczbę wystąpień, bo w Drive mogą istnieć
     * DWA pliki o tej samej nazwie w tym samym folderze — porównanie po samej
     * ścieżce fałszywie zaliczyłoby je jako jeden.
     */
    /**
     * klucz skrótu -> WSZYSTKIE targetId pod tym kluczem. Musi być tablica, bo
     * w jednym folderze mogą istnieć dwa skróty o tej samej nazwie — jeden
     * działający, drugi zepsuty. Sprawdzanie tylko jednego dawało fałszywy
     * alarm "brakuje w kopii". Zbierane WYŁĄCZNIE ze źródła.
     */
    const shortcutTargets = new Map<string, string[]>();
    /** klucz -> obiekty źródłowe, których Google NIE POZWALA kopiować */
    const cantCopyKeys = new Map<string, number>();
    /** klucz -> daty utworzenia obiektów źródłowych (wykrywanie zmian w trakcie) */
    const createdTimes = new Map<string, string[]>();
    /** klucz -> ID obiektów źródłowych (ze snapshotu), do sprawdzenia w manifeście */
    const srcIdsByKey = new Map<string, string[]>();
    const since = opts.since ?? arg('since');

    async function snapshot(rootId: string, label: string, collect = false) {
        const map = new Map<string, number>();
        const queue: Array<{ id: string; path: string }> = [
            { id: rootId, path: '' },
        ];
        let active = 0;
        let n = 0;
        async function w() {
            while (true) {
                const job = queue.shift();
                if (!job) {
                    if (active === 0) return;
                    await sleep(50);
                    continue;
                }
                active++;
                try {
                    for (const c of await listChildren(drive, job.id)) {
                        const p = `${job.path}/${c.name ?? '?'}`;
                        const isF = c.mimeType === FOLDER;
                        // Pliki NATYWNE Google (Dokumenty/Arkusze) po skopiowaniu
                        // mają NIEZNACZNIE INNY rozmiar — inne metadane, wyzerowana
                        // historia wersji. Porównywanie ich po rozmiarze dawało
                        // fałszywe "brakujące". Dla nich porównujemy tylko ścieżkę.
                        const isNative = (c.mimeType ?? '').startsWith(
                            'application/vnd.google-apps'
                        );
                        const isShortcut = c.mimeType === SHORTCUT;
                        const key = isF
                            ? `D|${p}`
                            : isShortcut
                              ? `S|${p}`
                              : isNative
                                ? `G|${p}`
                                : `F|${p}|${Number(c.size) || 0}`;
                        if (collect && isShortcut && c.shortcutDetails?.targetId) {
                            const list = shortcutTargets.get(key) ?? [];
                            list.push(c.shortcutDetails.targetId);
                            shortcutTargets.set(key, list);
                        }
                        if (collect && c.capabilities?.canCopy === false && !isF)
                            cantCopyKeys.set(key, (cantCopyKeys.get(key) ?? 0) + 1);
                        if (collect && c.createdTime) {
                            const list = createdTimes.get(key) ?? [];
                            list.push(c.createdTime);
                            createdTimes.set(key, list);
                        }
                        map.set(key, (map.get(key) ?? 0) + 1);
                        n++;
                        if (n % 100 === 0)
                            progress(
                                `\r[verify] ${label}: ${n} elementów   `
                            );
                        if (isF) queue.push({ id: c.id!, path: p });
                    }
                } finally {
                    active--;
                }
            }
        }
        await Promise.all(Array.from({ length: concurrency }, w));
        console.log(`\r[verify] ${label}: ${n} elementów            `);
        return map;
    }

    /**
     * PUNKT ODNIESIENIA: jeśli mamy snapshot z chwili kopiowania, porównujemy
     * z NIM, a nie z żywym źródłem. Źródło zmienia się w trakcie (ktoś edytuje,
     * dodaje, kasuje pliki), więc porównanie z jego bieżącym stanem zgłaszałoby
     * rozbieżności, które nie są brakami w kopii. Przy okazji oszczędza to
     * jedno pełne przejście drzewa.
     */
    const snapFile = opts.snapshotFile ?? arg('snapshot-file');
    let src: Map<string, number>;
    if (snapFile && existsSync(outPath(snapFile))) {
        console.log(`[verify] Punkt odniesienia: snapshot ${snapFile}`);
        src = new Map();
        let n = 0;
        for (const line of readFileSync(outPath(snapFile), 'utf8').split('\n')) {
            if (!line.trim()) continue;
            let o: any;
            try {
                o = JSON.parse(line);
            } catch {
                continue;
            }
            const isF = o.mimeType === FOLDER;
            const isShortcut = o.mimeType === SHORTCUT;
            const isNative = String(o.mimeType ?? '').startsWith(
                'application/vnd.google-apps'
            );
            const key = isF
                ? `D|${o.path}`
                : isShortcut
                  ? `S|${o.path}`
                  : isNative
                    ? `G|${o.path}`
                    : `F|${o.path}|${o.size ?? 0}`;
            src.set(key, (src.get(key) ?? 0) + 1);
            if (o.id) {
                const ids = srcIdsByKey.get(key) ?? [];
                ids.push(o.id);
                srcIdsByKey.set(key, ids);
            }
            if (isShortcut && o.targetId) {
                const l = shortcutTargets.get(key) ?? [];
                l.push(o.targetId);
                shortcutTargets.set(key, l);
            }
            if (o.canCopy === false && !isF)
                cantCopyKeys.set(key, (cantCopyKeys.get(key) ?? 0) + 1);
            n++;
        }
        console.log(`[verify] źródło (ze snapshotu): ${n} elementów`);
    } else {
        console.log('[verify] Skanuję drzewo ŹRÓDŁOWE (brak snapshotu)...');
        src = await snapshot(source, 'źródło', true);
    }
    console.log('[verify] Skanuję KOPIĘ...');
    const dst = await snapshot(target, 'kopia ');

    const missing: string[] = [];
    const brokenSrc: string[] = [];
    const addedDuring: string[] = [];
    /** obiekty, których Google nie pozwala skopiować (canCopy=false) */
    const notCopyable: string[] = [];
    /** skopiowane, ale w źródle zmienione po backupie (kopia = stan z chwili backupu) */
    const changedAfter: string[] = [];
    let missingCount = 0,
        srcTotal = 0,
        dstTotal = 0;
    for (const [key, cnt] of src) {
        srcTotal += cnt;
        const have = dst.get(key) ?? 0;
        if (have < cnt) {
            // Obiekty utworzone w źródle JUŻ PO starcie kopiowania nie mogły
            // zostać skopiowane — to zmiana w trakcie, nie brak w kopii.
            if (since) {
                const fresh = (createdTimes.get(key) ?? []).filter(
                    (t) => t > since
                ).length;
                if (fresh >= cnt - have) {
                    addedDuring.push(`${key.slice(2)}  ×${fresh}`);
                    continue;
                }
            }
            // Google nie pozwala kopiować niektórych typów (mapy My Maps, pliki
            // aplikacji zewnętrznych) — canCopy=false. Kopiowanie już to zgłosiło;
            // tutaj nie liczymy tego jako braku, bo nie da się tego naprawić.
            const noCopy = cantCopyKeys.get(key) ?? 0;
            if (noCopy >= cnt - have) {
                notCopyable.push(key.slice(2));
                continue;
            }
            // Plik JEST w manifeście (czyli został skopiowany), ale jego rozmiar
            // w źródle już się nie zgadza — ktoś go edytował PO skopiowaniu.
            // Kopia ma wersję z chwili backupu i to jest stan poprawny.
            const ids = srcIdsByKey.get(key) ?? [];
            const copied = ids.filter((i) => manifestMap.has(i)).length;
            if (ids.length && copied >= cnt - have) {
                changedAfter.push(key.slice(2));
                continue;
            }
            // Brakujący SKRÓT może być zepsuty już w źródle (cel usunięty) —
            // wtedy nie da się go odtworzyć i to NIE jest brak w kopii.
            if (key.startsWith('S|')) {
                const shortfall = cnt - have;
                const targets = shortcutTargets.get(key) ?? [];
                let brokenN = 0;
                for (const t of targets) {
                    try {
                        await drive.files.get({
                            fileId: t,
                            fields: 'id',
                            supportsAllDrives: true,
                        });
                    } catch {
                        brokenN++;
                    }
                }
                if (brokenN >= shortfall) {
                    brokenSrc.push(
                        `${key.slice(2)}  → ${brokenN} z ${targets.length} celów nie istnieje`
                    );
                    continue;
                }
                // zepsute skróty wyjaśniają tylko część braku — resztę zgłaszamy
                if (brokenN > 0) {
                    brokenSrc.push(
                        `${key.slice(2)}  → ${brokenN} z ${targets.length} celów nie istnieje (częściowo)`
                    );
                    missingCount += shortfall - brokenN;
                    missing.push(
                        `[skrót]   ${key.slice(2)}  ×${shortfall - brokenN} (niewyjaśnione)`
                    );
                    continue;
                }
            }
            missingCount += cnt - have;
            const [kind, path, size] = key.split('|');
            const label =
                kind === 'D'
                    ? '[folder]'
                    : kind === 'S'
                      ? '[skrót]  '
                      : kind === 'G'
                        ? '[GoogleDoc]'
                        : '[plik]  ';
            missing.push(
                `${label} ${path}` +
                    (size ? `  (${size} B)` : '') +
                    (cnt - have > 1 ? `  ×${cnt - have}` : '')
            );
        }
    }
    for (const cnt of dst.values()) dstTotal += cnt;

    console.log('\n=== WERYFIKACJA KOPII ===');
    console.log(`  Elementów w źródle:    ${srcTotal}`);
    console.log(`  Elementów w kopii:     ${dstTotal}`);
    console.log(`  ❌ BRAKUJE w kopii:     ${missingCount}`);
    console.log(
        `  ℹ Nadmiarowe w kopii:  ${Math.max(0, dstTotal - (srcTotal - missingCount))}`
    );
    console.log(
        '  (porównanie po ścieżce ORAZ rozmiarze — wykrywa też uciętą kopię)'
    );

    if (missing.length) {
        const missPath = outPath('gd-backup-missing.txt');
        writeFileSync(missPath, missing.join('\n'), 'utf8');
        console.log('\n  Pierwsze brakujące:');
        missing.slice(0, 15).forEach((p) => console.log('    ' + p));
        console.log('  Pełna lista: ' + missPath);
    }

    if (changedAfter.length) {
        console.log(
            `
  ℹ Zmienione w ŹRÓDLE po skopiowaniu: ${changedAfter.length} —` +
                `
    kopia zawiera wersję z chwili backupu. To poprawny stan` +
                `
    kopii punktu w czasie, NIE brak.`
        );
        changedAfter.slice(0, 5).forEach((x) => console.log('      ' + x));
    }
    if (notCopyable.length) {
        const p = outPath('gd-verify-niekopiowalne.txt');
        writeFileSync(p, notCopyable.join('\n'), 'utf8');
        console.log(
            `\n  ⛔ NIEKOPIOWALNE przez Google: ${notCopyable.length} —` +
                `\n    (np. mapy My Maps, pliki aplikacji zewnętrznych; canCopy=false)` +
                `\n    Żadne narzędzie API ich nie zabezpieczy. Lista: ${p}`
        );
        notCopyable.slice(0, 5).forEach((x) => console.log('      ' + x));
    }
    if (addedDuring.length) {
        console.log(
            `\n  ℹ Dodane w ŹRÓDLE w trakcie kopiowania: ${addedDuring.length} —` +
                `\n    powstały po starcie przebiegu, więc nie mogły trafić do kopii.` +
                `\n    NIE liczone jako brak. Kolejny przebieg je dobierze.`
        );
        addedDuring.slice(0, 5).forEach((p) => console.log('      ' + p));
    }
    if (brokenSrc.length) {
        const p = outPath('gd-verify-broken-shortcuts.txt');
        writeFileSync(p, brokenSrc.join('\n'), 'utf8');
        console.log(
            `\n  ℹ Zepsute skróty w ŹRÓDLE: ${brokenSrc.length} — ich cele już nie istnieją,` +
                `\n    więc nie da się ich odtworzyć. NIE liczone jako brak w kopii.` +
                `\n    Lista: ${p}`
        );
    }

    console.log(
        missingCount === 0
            ? '\n[verify] ✅ KOPIA KOMPLETNA — każdy istniejący element źródła ma odpowiednik w kopii.'
            : '\n[verify] ⚠ KOPIA NIEKOMPLETNA — NIE uruchamiaj transferu własności, dopóki tego nie wyjaśnisz.'
    );
    return { srcTotal, dstTotal, missingCount, broken: brokenSrc.length };
}

// ---------------- SNAPSHOT METADANYCH ----------------
/**
 * Zrzut całego drzewa do JSONL: id, nazwa, typ, właściciel, rozmiar, ścieżka,
 * rodzic. Nie kopiuje niczego — służy do diagnozy i odtworzenia wiedzy
 * "co gdzie było i do kogo należało" po ewentualnym bałaganie.
 */
async function snapshotMode(drive: drive_v3.Drive, opts: ModeOpts = {}) {
    const source = opts.source ?? arg('source');
    if (!source) throw new Error('Podaj --source.');
    const out = outPath(opts.out ?? arg('out', 'gd-snapshot.jsonl')!);
    const concurrency =
        opts.concurrency ?? Math.max(1, Number(arg('concurrency', '20')) || 20);

    writeFileSync(out, '', 'utf8');
    let n = 0;
    const byOwner = new Map<string, number>();
    const queue: Array<{ id: string; path: string }> = [
        { id: source, path: '' },
    ];
    let active = 0;

    async function w() {
        while (true) {
            const job = queue.shift();
            if (!job) {
                if (active === 0) return;
                await sleep(50);
                continue;
            }
            active++;
            try {
                const children = await listChildren(drive, job.id);
                const lines: string[] = [];
                for (const c of children) {
                    const p = `${job.path}/${c.name ?? '?'}`;
                    const owner =
                        c.owners?.[0]?.emailAddress?.toLowerCase() ?? '?';
                    byOwner.set(owner, (byOwner.get(owner) ?? 0) + 1);
                    lines.push(
                        JSON.stringify({
                            id: c.id,
                            name: c.name,
                            mimeType: c.mimeType,
                            owner,
                            size: Number(c.size) || 0,
                            parentId: job.id,
                            path: p,
                            // potrzebne, by weryfikacja mogła rozpoznać
                            // niekopiowalne pliki i zepsute skróty
                            canCopy: c.capabilities?.canCopy,
                            targetId: c.shortcutDetails?.targetId,
                        })
                    );
                    n++;
                    if (c.mimeType === FOLDER)
                        queue.push({ id: c.id!, path: p });
                }
                if (lines.length)
                    appendFileSync(out, lines.join('\n') + '\n', 'utf8');
                if (n % 200 < children.length)
                    progress(
                        `\r[snapshot] elementów: ${n}, kolejka: ${queue.length}   `
                    );
            } finally {
                active--;
            }
        }
    }
    await Promise.all(Array.from({ length: concurrency }, w));
    console.log(`\n\n[snapshot] Zapisano ${n} elementów → ${out}`);
    console.log('[snapshot] Wg właściciela (top 10):');
    [...byOwner.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([o, c]) =>
            console.log(`  ${String(c).padStart(7)}  ${o}`)
        );
}

// ---------------- TRYB WSADOWY ----------------
/**
 * Przetwarza wiele projektów w JEDNYM procesie: snapshot → kopia → weryfikacja
 * dla każdego. Eliminuje ~18 s narzutu startowego ts-node na każdą komendę
 * (przy 86 projektach × 3 komendy to ponad godzina samego startowania).
 *
 * Plik listy: jedno ID folderu w linii. Dopuszczalne `ID` albo `ID|własna-nazwa`.
 * Puste linie i te zaczynające się od # są pomijane.
 * Nazwa manifestu/snapshotu jest wyprowadzana z nazwy folderu na Drive.
 *
 * Domyślnie PRZERYWA na pierwszym problemie (błąd kopii albo nieudana
 * weryfikacja) — żeby nie brnąć dalej z niepewnym stanem. `--continue-on-error`
 * zmienia to na "leć dalej i zbierz raport".
 */
async function batchMode(drive: drive_v3.Drive) {
    const listFile = arg('batch')!;
    const target = arg('target');
    if (!target) throw new Error('Podaj --target.');
    if (!existsSync(listFile))
        throw new Error(`Brak pliku listy: ${listFile}`);
    const apply = flag('apply');
    const concurrency = Math.max(1, Number(arg('concurrency', '10')) || 10);
    const keepGoing = flag('continue-on-error');
    const withSnapshot = !flag('no-snapshot');

    const entries: Array<{ id: string; slug?: string }> = [];
    for (const raw of readFileSync(listFile, 'utf8').split('\n')) {
        // komentarz może być zarówno całą linią, jak i na jej końcu
        // (`ID   # 2 elem. NAZWA`) — bez tego cała linia szła jako ID
        const line = raw.split('#')[0].trim();
        if (!line) continue;
        const [id, slug] = line.split('|').map((s) => s.trim());
        if (id) entries.push({ id, slug: slug || undefined });
    }
    if (!entries.length) throw new Error('Lista projektów jest pusta.');

    console.log(
        `\n=== TRYB WSADOWY: ${entries.length} projektów ===` +
            `\n  cel: ${target}  |  ${apply ? 'APPLY' : 'DRY-RUN'}  |  współbieżność: ${concurrency}` +
            `\n  na błędzie: ${keepGoing ? 'kontynuuj' : 'PRZERWIJ'}\n`
    );

    type Row = {
        slug: string;
        id: string;
        files: number;
        folders: number;
        gb: string;
        broken: number;
        errors: number;
        missing: number | null;
        ok: boolean;
    };
    const results: Row[] = [];
    let stopped = false;

    for (let i = 0; i < entries.length; i++) {
        const { id } = entries[i];
        let slug = entries[i].slug;
        let name = slug ?? id;
        try {
            const meta = await withRetry(() =>
                drive.files.get({
                    fileId: id,
                    fields: 'name',
                    supportsAllDrives: true,
                })
            );
            name = meta.data.name ?? id;
            if (!slug)
                slug =
                    name
                        .replace(/[^A-Za-z0-9]+/g, '-')
                        .replace(/^-+|-+$/g, '')
                        .slice(0, 32) || id;
        } catch (err: any) {
            console.error(
                `\n[${i + 1}/${entries.length}] ${id} — ✗ nie mogę odczytać folderu: ${err.message}`
            );
            results.push({
                slug: id, id, files: 0, folders: 0, gb: '0',
                broken: 0, errors: 1, missing: null, ok: false,
            });
            if (!keepGoing) { stopped = true; break; }
            continue;
        }

        console.log(
            `\n────────── [${i + 1}/${entries.length}] ${name} ──────────`
        );
        retryCount = 0;
        try {
            if (withSnapshot)
                await snapshotMode(drive, {
                    source: id,
                    out: `snap-${slug}.jsonl`,
                });
            const st = await backupMode(drive, {
                source: id,
                target,
                manifest: `bak-${slug}.jsonl`,
                apply,
                concurrency,
            });
            let missing: number | null = null;
            if (apply) {
                const v = await verifyMode(drive, {
                    source: id,
                    target,
                    manifest: `bak-${slug}.jsonl`,
                    concurrency,
                    since: st.startedAt, // odsiewa pliki dodane w trakcie kopiowania
                    snapshotFile: withSnapshot
                        ? `snap-${slug}.jsonl`
                        : undefined,
                });
                missing = v.missingCount;
            }
            const ok = st.errors === 0 && (missing === null || missing === 0);
            results.push({
                slug: slug!, id,
                files: st.files, folders: st.folders,
                gb: (st.bytes / 1024 ** 3).toFixed(2),
                broken: st.brokenShortcuts, errors: st.errors,
                missing, ok,
            });
            if (!ok && !keepGoing) {
                console.error(
                    `\n>>> PRZERYWAM: ${name} — błędy=${st.errors}, brakuje=${missing}`
                );
                stopped = true;
                break;
            }
        } catch (err: any) {
            console.error(`\n>>> WYJĄTEK przy ${name}: ${err.message}`);
            results.push({
                slug: slug!, id, files: 0, folders: 0, gb: '0',
                broken: 0, errors: 1, missing: null, ok: false,
            });
            if (!keepGoing) { stopped = true; break; }
        }
    }

    console.log('\n\n═══════════ RAPORT ZBIORCZY ═══════════');
    console.log(
        '  ' +
            'projekt'.padEnd(34) +
            'pliki'.padStart(7) +
            'GB'.padStart(9) +
            'zepsute'.padStart(9) +
            'brak'.padStart(6) +
            '  status'
    );
    for (const r of results)
        console.log(
            '  ' +
                r.slug.slice(0, 32).padEnd(34) +
                String(r.files).padStart(7) +
                r.gb.padStart(9) +
                String(r.broken).padStart(9) +
                String(r.missing ?? '-').padStart(6) +
                (r.ok ? '  ✅' : '  ❌')
        );
    const okN = results.filter((r) => r.ok).length;
    const tf = results.reduce((a, r) => a + r.files, 0);
    const tg = results.reduce((a, r) => a + Number(r.gb), 0);
    console.log(
        `\n  Ukończone poprawnie: ${okN}/${results.length}` +
            `   |   pliki: ${tf}   |   ${tg.toFixed(2)} GB`
    );
    if (stopped)
        console.log(
            '\n  ⚠ PRZERWANO na pierwszym problemie. Pozostałe projekty NIE zostały ruszone.'
        );
    if (!apply)
        console.log('\n  To był DRY-RUN — dodaj --apply, aby wykonać.');
}

async function main() {
    const auth = await getAuth();
    const drive = google.drive({ version: 'v3', auth });
    if (arg('batch')) return batchMode(drive);
    if (flag('snapshot')) return snapshotMode(drive);
    if (flag('verify')) return verifyMode(drive);
    return backupMode(drive);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[backup] Błąd:', err.message || err);
        process.exit(1);
    });
