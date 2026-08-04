/**
 * TEST migracji folderu na Dysk współdzielony (bez bazy, dane-śmieci).
 *
 * Migruje ZAWARTOŚĆ folderu --source do folderu --target na Shared Drive:
 *   - plik, którego właściciel ∈ --move-owners i mamy jego token → MOVE (kontem
 *     właściciela; tylko właściciel może wrzucić plik na Shared Drive),
 *   - plik spoza listy → COPY (kontem master jako czytelnik/Menedżer),
 *   - foldery → odtwarzane (create) w target, rekurencyjnie.
 *
 * BEZPIECZEŃSTWO:
 *   - `--dry-run` DOMYŚLNIE (nic nie zmienia); realny przebieg dopiero z `--apply`.
 *   - Bezpiecznik potomka: rusza WYŁĄCZNIE obiekty wewnątrz --source.
 *   - Do MOVE usuwa TYLKO powiązanie z folderem źródłowym (removeParents=src),
 *     nie odpina pliku z innych lokalizacji właściciela.
 *
 * TOKENY: mapa email→refreshToken w pliku JSON (--tokens tokens.json).
 *   Konto master (do odczytu i COPY) bierzemy z env REFRESH_TOKEN + --master-email,
 *   albo z pliku tokenów. Zbieranie tokenu: `--get-token` (patrz niżej).
 *
 * UŻYCIE:
 *   # 1) zdobądź refresh token dla konta (jednorazowa zgoda OAuth)
 *   yarn gd:move-test --get-token
 *   yarn gd:move-test --get-token --code <KOD_Z_URL_PRZEKIEROWANIA>
 *
 *   # 2) podejrzyj własność drzewa
 *   yarn gd:move-test --inspect --source <folderId> --master-email oramwp@gmail.com
 *
 *   # 3) dry-run migracji (nic nie zmienia)
 *   yarn gd:move-test --source <src> --target <sharedDriveFolder> \
 *       --move-owners oramwp@gmail.com,drugie@gmail.com \
 *       --tokens tokens.json --master-email oramwp@gmail.com
 *
 *   # 4) realny przebieg
 *   ...to samo... --apply
 *
 *   # 5) sprzątanie testu (kosz zawartości folderu docelowego)
 *   yarn gd:move-test --cleanup <targetFolderId> --master-email oramwp@gmail.com --tokens tokens.json --apply
 *
 * tokens.json: { "oramwp@gmail.com": "1//refresh...", "drugie@gmail.com": "1//..." }
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import { google, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { keys } from '../setup/Sessions/credentials';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import http from 'http';

function arg(name: string, def?: string): string | undefined {
    const a = process.argv.slice(2);
    const i = a.findIndex((x) => x === `--${name}`);
    if (i === -1) return def;
    const n = a[i + 1];
    if (n === undefined || n.startsWith('--')) return 'true';
    return n;
}
const flag = (n: string) => process.argv.slice(2).includes(`--${n}`);

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
/** Postęp wypisywany tylko na terminal — przy przekierowaniu do pliku znak
 *  powrotu karetki nie nadpisuje linii i log rośnie do megabajtów. */
function progress(text: string) {
    if (process.stdout.isTTY) process.stdout.write(text);
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

function newClient(refreshToken: string): OAuth2Client {
    const c = new OAuth2Client(
        keys.installed.client_id,
        keys.installed.client_secret,
        keys.installed.redirect_uris[0]
    );
    c.setCredentials({ refresh_token: refreshToken });
    return c;
}

// ---------- tryb: zdobycie tokenu (loopback) ----------
async function getTokenMode() {
    const port = Number(arg('port', '4571')) || 4571;
    const redirectUri =
        arg('redirect') || `http://localhost:${port}/oauth2callback`;
    const client = new OAuth2Client(
        keys.installed.client_id,
        keys.installed.client_secret,
        redirectUri
    );
    const url = client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/drive'],
        prompt: 'consent',
    });

    console.log(`\n[get-token] redirect_uri = ${redirectUri}`);
    console.log(
        'Jeśli dostaniesz "redirect_uri_mismatch", dodaj DOKŁADNIE ten URI w:'
    );
    console.log(
        '  Google Cloud Console → APIs & Services → Credentials → (Twój OAuth Client) → Authorized redirect URIs\n'
    );

    // Tryb ZDALNY: wygeneruj gotową instrukcję do wysłania innej osobie.
    // Ta osoba nie musi nic instalować — otwiera link, klika "Zezwól",
    // a z paska adresu kopiuje kod (strona się nie wczyta, to normalne).
    if (flag('remote')) {
        console.log(
            '=== SKOPIUJ PONIŻSZE I WYŚLIJ OSOBIE (prywatnym kanałem) ===\n'
        );
        console.log(
            'Cześć! Potrzebuję jednorazowej zgody na przeniesienie Twoich plików\n' +
                'z Dysku Google do firmowego Dysku współdzielonego.\n\n' +
                '1. Otwórz ten link (zalogowany na SWOJE konto Google):\n\n' +
                url +
                '\n\n' +
                '2. Kliknij "Zezwól".\n' +
                '3. Przeglądarka pokaże błąd "nie można połączyć" — TO NORMALNE.\n' +
                '4. Skopiuj CAŁY adres z paska przeglądarki i odeślij mi go.\n' +
                '   (zaczyna się od http://localhost:' +
                port +
                '/oauth2callback?code=...)\n\n' +
                'WAŻNE: adres traci ważność po ~10 minutach, więc odeślij od razu.\n' +
                'Dostęp możesz w każdej chwili cofnąć na myaccount.google.com →\n' +
                'Bezpieczeństwo → Twoje połączenia z aplikacjami innych firm.'
        );
        console.log(
            '\n=== KONIEC ===\n\nGdy dostaniesz odpowiedź, uruchom:\n' +
                '  yarn gd:move-test --get-token --code "<WKLEJONY_ADRES_LUB_KOD>"'
        );
        return;
    }

    // Fallback ręczny: --code <kod albo cały URL przekierowania>
    const manualCode = arg('code');
    if (manualCode && manualCode !== 'true') {
        const code = extractCode(manualCode);
        const { tokens } = await client.getToken(code);
        printToken(tokens.refresh_token);
        return;
    }

    const code: string = await new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const u = new URL(req.url || '/', redirectUri);
            const err = u.searchParams.get('error');
            const c = u.searchParams.get('code');
            if (err) {
                res.end('Blad OAuth: ' + err);
                server.close();
                return reject(new Error(err));
            }
            if (c) {
                res.end('OK - token pobrany. Wroc do terminala.');
                server.close();
                return resolve(c);
            }
            res.end('Czekam na code...');
        });
        server.on('error', reject);
        server.listen(port, () => {
            console.log(
                'Otwórz ten link (zalogowany na KONTO, którego token chcesz):\n'
            );
            console.log(url + '\n');
            console.log(
                'Po kliknięciu "Zezwól" kod pobierze się tutaj automatycznie.\n'
            );
        });
    });

    const { tokens } = await client.getToken(code);
    printToken(tokens.refresh_token);
}

/** Przyjmuje sam kod albo cały URL przekierowania i zwraca czysty kod. */
function extractCode(input: string): string {
    const raw = input.trim().replace(/^["']|["']$/g, '');
    if (raw.includes('code=')) {
        const m = raw.match(/[?&]code=([^&\s]+)/);
        if (m) return decodeURIComponent(m[1]);
    }
    return decodeURIComponent(raw);
}

function printToken(refreshToken?: string | null) {
    if (!refreshToken) {
        console.error(
            'Brak refresh_token — cofnij dostęp aplikacji (myaccount.google.com) i spróbuj ponownie (prompt=consent).'
        );
        return;
    }
    console.log('\nrefresh_token:\n' + refreshToken + '\n');
    console.log('Wklej do tokens.json pod kluczem = email tego konta.');
}

// ---------- ładowanie tokenów/klientów ----------
type Clients = { byEmail: Map<string, OAuth2Client>; masterEmail: string };

async function loadClients(): Promise<Clients> {
    const byEmail = new Map<string, OAuth2Client>();
    const tokensPath = arg('tokens');
    if (tokensPath && existsSync(tokensPath)) {
        const map = JSON.parse(readFileSync(tokensPath, 'utf8')) as Record<
            string,
            string
        >;
        for (const [email, tok] of Object.entries(map))
            byEmail.set(email.trim().toLowerCase(), newClient(tok));
    }
    const masterEmail = (arg('master-email') || '').trim().toLowerCase();
    if (!masterEmail)
        throw new Error('Podaj --master-email (konto do odczytu i COPY).');
    if (!byEmail.has(masterEmail) && process.env.REFRESH_TOKEN)
        byEmail.set(masterEmail, newClient(process.env.REFRESH_TOKEN));
    if (!byEmail.has(masterEmail))
        throw new Error(
            `Brak tokenu dla master (${masterEmail}) — ustaw REFRESH_TOKEN w env lub dodaj do --tokens.`
        );
    // walidacja tokenów + WERYFIKACJA TOŻSAMOŚCI (token musi należeć do konta z klucza)
    const verified = new Map<string, OAuth2Client>();
    for (const [email, client] of byEmail) {
        let actual: string;
        try {
            await client.getAccessToken();
            const about = await google
                .drive({ version: 'v3', auth: client })
                .about.get({ fields: 'user(emailAddress)' });
            actual = (about.data.user?.emailAddress || '').toLowerCase();
        } catch {
            throw new Error(`Token dla ${email} jest nieważny/odrzucony.`);
        }
        if (actual && actual !== email) {
            console.warn(
                `[tokens] ⚠ token podpisany jako "${email}" należy w rzeczywistości do "${actual}" — używam prawdziwego maila.`
            );
            verified.set(actual, client);
        } else {
            verified.set(email, client);
        }
    }
    console.log(
        `[tokens] Dostępne konta: ${[...verified.keys()].join(', ')} (master: ${masterEmail})`
    );
    if (!verified.has(masterEmail))
        throw new Error(
            `Token mastera (${masterEmail}) nie pasuje do żadnego zweryfikowanego konta. Sprawdź tokens.json / REFRESH_TOKEN.`
        );
    return { byEmail: verified, masterEmail };
}

function ownerOf(f: drive_v3.Schema$File, masterEmail: string): string {
    if (f.ownedByMe === true) return masterEmail;
    return (f.owners?.[0]?.emailAddress || '(nieznany)').toLowerCase();
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
                fields: 'nextPageToken, files(id,name,mimeType,size,ownedByMe,owners(emailAddress),parents)',
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

const FOLDER = 'application/vnd.google-apps.folder';

// ---------- tryb: inspect ----------
async function inspectMode(clients: Clients) {
    const source = arg('source');
    if (!source) throw new Error('Podaj --source.');
    const drive = google.drive({ version: 'v3', auth: clients.byEmail.get(clients.masterEmail)! });
    const byOwner = new Map<string, { files: number; folders: number }>();
    let total = 0;

    const maxDepth = Number(arg('depth', '0')) || 0; // 0 = bez limitu
    const listTop = flag('list');

    async function walk(id: string, depth: number) {
        const children = await listChildren(drive, id);
        for (const c of children) {
            total++;
            const owner = ownerOf(c, clients.masterEmail);
            const s = byOwner.get(owner) ?? { files: 0, folders: 0 };
            if (c.mimeType === FOLDER) s.folders++;
            else s.files++;
            byOwner.set(owner, s);
            if (listTop && depth === 0)
                console.log(
                    `  ${c.mimeType === FOLDER ? '[DIR ]' : '[FILE]'} ${(c.name || '').padEnd(45)} ${owner}`
                );
            if (c.mimeType === FOLDER && (maxDepth === 0 || depth + 1 < maxDepth))
                await walk(c.id!, depth + 1);
        }
    }
    console.log(`[inspect] Skanuję ${source} ...`);
    await walk(source, 0);
    console.log(`\n[inspect] Elementów: ${total}`);
    console.log('[inspect] Wg właściciela:');
    for (const [owner, s] of [...byOwner.entries()].sort(
        (a, b) => b[1].files + b[1].folders - (a[1].files + a[1].folders)
    ))
        console.log(`  ${owner.padEnd(34)} pliki=${s.files} foldery=${s.folders}`);
}

// ---------- tryb: transfer własności (konsument → konsument, BEZ shared drive) ----------
/**
 * Test klasycznego transferu własności między kontami konsumenckimi:
 *   1. INICJACJA  – tokenem OBECNEGO właściciela (--from): nadaje odbiorcy
 *      uprawnienie writer z pendingOwner=true (zaproszenie do przejęcia).
 *   2. AKCEPTACJA – tokenem NOWEGO właściciela (--to): update własnego
 *      uprawnienia na role=owner z transferOwnership=true.
 *   3. WERYFIKACJA – files.get(owners).
 * Oczekiwania: foldery i natywne pliki Google powinny przejść;
 * pliki binarne (PDF/PNG) mogą zostać odrzucone (ograniczenie kont konsumenckich).
 */
async function transferMode(clients: Clients) {
    const rootId = arg('transfer');
    if (!rootId || rootId === 'true')
        throw new Error('Podaj --transfer <fileOrFolderId>.');
    const from = (arg('from') || '').trim().toLowerCase();
    const to = (arg('to') || '').trim().toLowerCase();
    if (!from || !to) throw new Error('Podaj --from <email> i --to <email>.');
    for (const email of [from, to])
        if (!clients.byEmail.has(email))
            throw new Error(`Brak tokenu dla ${email} (tokens.json).`);
    const apply = flag('apply');

    const fromDrive = google.drive({ version: 'v3', auth: clients.byEmail.get(from)! });
    const toDrive = google.drive({ version: 'v3', auth: clients.byEmail.get(to)! });
    const masterDrive = google.drive({ version: 'v3', auth: clients.byEmail.get(clients.masterEmail)! });

    // zbierz obiekty własności `from`: wskazany obiekt + (dla folderu) całe poddrzewo
    const targets: drive_v3.Schema$File[] = [];
    const rootMeta = (
        await withRetry(() =>
            masterDrive.files.get({
                fileId: rootId,
                fields: 'id,name,mimeType,owners(emailAddress)',
                supportsAllDrives: true,
            })
        )
    ).data;
    const ownerEmail = (f: drive_v3.Schema$File) =>
        (f.owners?.[0]?.emailAddress || '').toLowerCase();
    if (ownerEmail(rootMeta) === from) targets.push(rootMeta);
    async function collect(folderId: string) {
        for (const c of await listChildren(masterDrive, folderId)) {
            if (ownerEmail(c) === from) targets.push(c);
            if (c.mimeType === FOLDER) await collect(c.id!);
        }
    }
    if (rootMeta.mimeType === FOLDER) await collect(rootId);

    console.log(
        `[transfer] ${apply ? 'APPLY' : 'DRY-RUN'}  ${from} → ${to}` +
            `\n[transfer] Obiektów własności ${from} w drzewie: ${targets.length}\n`
    );

    let ok = 0,
        pendingOnly = 0,
        failed = 0;

    for (const t of targets) {
        const kind =
            t.mimeType === FOLDER
                ? 'FOLDER'
                : t.mimeType?.startsWith('application/vnd.google-apps')
                  ? 'NATIVE'
                  : 'BINARY';
        console.log(`[${kind}] ${t.name}  (${t.id})`);
        if (!apply) continue;

        try {
            // 1. INICJACJA (tokenem from): pendingOwner na uprawnieniu odbiorcy
            const perms = (
                await withRetry(() =>
                    fromDrive.permissions.list({
                        fileId: t.id!,
                        fields: 'permissions(id,emailAddress,role,pendingOwner)',
                    })
                )
            ).data.permissions ?? [];
            let toPerm = perms.find(
                (p) => (p.emailAddress || '').toLowerCase() === to
            );
            if (toPerm) {
                await withRetry(() =>
                    fromDrive.permissions.update({
                        fileId: t.id!,
                        permissionId: toPerm!.id!,
                        requestBody: { role: 'writer', pendingOwner: true },
                    })
                );
            } else {
                toPerm = (
                    await withRetry(() =>
                        fromDrive.permissions.create({
                            fileId: t.id!,
                            requestBody: {
                                type: 'user',
                                role: 'writer',
                                emailAddress: to,
                                pendingOwner: true,
                            },
                            fields: 'id',
                        })
                    )
                ).data;
            }
            console.log('   1. inicjacja (pendingOwner) ✓');

            // 2. AKCEPTACJA (tokenem to)
            try {
                await withRetry(() =>
                    toDrive.permissions.update({
                        fileId: t.id!,
                        permissionId: toPerm!.id!,
                        requestBody: { role: 'owner' },
                        transferOwnership: true,
                    })
                );
                console.log('   2. akceptacja (transferOwnership) ✓');
            } catch (err: any) {
                console.error(
                    `   2. akceptacja ✗: ${err.message} ${reason(err)}`
                );
                pendingOnly++;
                continue;
            }

            // 3. WERYFIKACJA
            const after = (
                await withRetry(() =>
                    masterDrive.files.get({
                        fileId: t.id!,
                        fields: 'owners(emailAddress)',
                    })
                )
            ).data;
            const newOwner = (after.owners?.[0]?.emailAddress || '?').toLowerCase();
            if (newOwner === to) {
                console.log(`   3. właściciel = ${newOwner} ✓✓ TRANSFER OK`);
                ok++;
            } else {
                console.warn(`   3. właściciel nadal = ${newOwner} (?)`);
                pendingOnly++;
            }
        } catch (err: any) {
            console.error(`   ✗ inicjacja: ${err.message} ${reason(err)}`);
            failed++;
        }
    }

    console.log('\n=== PODSUMOWANIE TRANSFERU ===');
    console.log(`  Obiektów:              ${targets.length}`);
    if (apply) {
        console.log(`  Przeniesiona własność: ${ok}`);
        console.log(`  Tylko zaproszenie (pending, akceptacja padła): ${pendingOnly}`);
        console.log(`  Błąd inicjacji:        ${failed}`);
    } else {
        console.log('  DRY-RUN — dodaj --apply, aby wykonać.');
    }
}

// ---------- snapshot i weryfikacja przejęcia ----------
/**
 * Zrzut stanu drzewa do JSONL (id, nazwa, typ, właściciel, rozmiar, ścieżka).
 * Robiony PRZED przejęciem — bez niego nie da się po fakcie stwierdzić, czy
 * czegoś nie zgubiono, bo takeover modyfikuje oryginały.
 */
async function snapshotTree(
    drive: drive_v3.Drive,
    rootId: string,
    master: string,
    out: string,
    concurrency = 20
): Promise<number> {
    writeFileSync(out, '', 'utf8');
    let n = 0;
    const queue: Array<{ id: string; path: string }> = [{ id: rootId, path: '' }];
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
                const kids = await listChildren(drive, job.id);
                const lines: string[] = [];
                for (const c of kids) {
                    const p = `${job.path}/${c.name ?? '?'}`;
                    lines.push(
                        JSON.stringify({
                            id: c.id,
                            name: c.name,
                            mimeType: c.mimeType,
                            owner: ownerOf(c, master),
                            size: Number(c.size) || 0,
                            path: p,
                        })
                    );
                    n++;
                    if (c.mimeType === FOLDER)
                        queue.push({ id: c.id!, path: p });
                }
                if (lines.length)
                    appendFileSync(out, lines.join('\n') + '\n', 'utf8');
            } finally {
                active--;
            }
        }
    }
    await Promise.all(Array.from({ length: concurrency }, w));
    return n;
}

/**
 * WERYFIKACJA PO PRZEJĘCIU. Sprawdza dwa niezmienniki:
 *   1. KOMPLETNOŚĆ — każdy obiekt ze snapshotu ma odpowiednik w drzewie:
 *      albo to samo ID (transfer/własny), albo nowe ID z mapy (kopia/zamiennik),
 *      albo oryginał świadomie trafił do archiwum.
 *   2. JEDNOLITA WŁASNOŚĆ — w drzewie nie został ANI JEDEN obiekt cudzy.
 *      To warunek konieczny, żeby przeciągnięcie na Shared Drive przeszło.
 */
async function verifyTakeoverMode(clients: Clients) {
    const rootId = arg('verify-takeover');
    if (!rootId || rootId === 'true')
        throw new Error('Podaj --verify-takeover <folderId>.');
    const snapFile = arg('before');
    const mapFile = arg('map', 'gd-takeover-map.json')!;
    const concurrency = Math.max(1, Number(arg('concurrency', '20')) || 20);
    const master = clients.masterEmail;
    const drive = google.drive({
        version: 'v3',
        auth: clients.byEmail.get(master)!,
    });

    // mapa oldId -> newId
    const map = new Map<string, string>();
    for (const f of [mapFile, 'gd-takeover-map.jsonl']) {
        if (!existsSync(f)) continue;
        const txt = readFileSync(f, 'utf8');
        if (f.endsWith('.jsonl'))
            for (const line of txt.split('\n')) {
                if (!line.trim()) continue;
                try {
                    const o = JSON.parse(line);
                    if (o.old && o.new) map.set(o.old, o.new);
                } catch {}
            }
        else
            try {
                for (const [k, v] of Object.entries(JSON.parse(txt)))
                    map.set(k, String(v));
            } catch {}
    }

    console.log(`[verify] Drzewo: ${rootId}  |  mapa: ${map.size} par`);
    console.log('[verify] Skanuję bieżący stan drzewa...');

    const present = new Set<string>();
    const byOwner = new Map<string, number>();
    const foreign: string[] = [];
    let total = 0;
    const queue: Array<{ id: string; path: string }> = [
        { id: rootId, path: '' },
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
                for (const c of await listChildren(drive, job.id)) {
                    const p = `${job.path}/${c.name ?? '?'}`;
                    const owner = ownerOf(c, master);
                    present.add(c.id!);
                    byOwner.set(owner, (byOwner.get(owner) ?? 0) + 1);
                    total++;
                    if (owner !== master && foreign.length < 5000)
                        foreign.push(`${owner}  ${p}`);
                    if (c.mimeType === FOLDER)
                        queue.push({ id: c.id!, path: p });
                }
            } finally {
                active--;
            }
        }
    }
    await Promise.all(Array.from({ length: concurrency }, w));

    console.log(`[verify] Obiektów w drzewie: ${total}`);
    console.log('\n=== 1. JEDNOLITA WŁASNOŚĆ ===');
    for (const [o, n] of [...byOwner.entries()].sort((a, b) => b[1] - a[1]))
        console.log(
            `  ${String(n).padStart(7)}  ${o}${o === master ? '  ✅' : '  ⛔ ZABLOKUJE PRZECIĄGNIĘCIE'}`
        );
    if (foreign.length) {
        writeFileSync(
            'gd-takeover-obce.txt',
            foreign.join('\n'),
            'utf8'
        );
        console.log(`\n  Lista cudzych obiektów: gd-takeover-obce.txt`);
    }

    let missing: string[] = [];
    if (snapFile && existsSync(snapFile)) {
        console.log('\n=== 2. KOMPLETNOŚĆ (wg snapshotu sprzed przejęcia) ===');
        let before = 0;
        for (const line of readFileSync(snapFile, 'utf8').split('\n')) {
            if (!line.trim()) continue;
            let o: any;
            try {
                o = JSON.parse(line);
            } catch {
                continue;
            }
            before++;
            // obiekt jest rozliczony, jeśli: został w drzewie z tym samym ID
            // (transfer/własny) ALBO ma następcę z mapy obecnego w drzewie
            const successor = map.get(o.id);
            if (present.has(o.id)) continue;
            if (successor && present.has(successor)) continue;
            if (missing.length < 5000) missing.push(`${o.path}  (id=${o.id})`);
        }
        console.log(`  Obiektów przed przejęciem: ${before}`);
        console.log(`  Obiektów teraz:            ${total}`);
        console.log(`  ❌ NIEROZLICZONYCH:        ${missing.length}`);
        if (missing.length) {
            writeFileSync(
                'gd-takeover-nierozliczone.txt',
                missing.join('\n'),
                'utf8'
            );
            missing.slice(0, 10).forEach((m) => console.log('    ' + m));
            console.log('    Pełna lista: gd-takeover-nierozliczone.txt');
        }
    } else {
        console.log(
            '\n=== 2. KOMPLETNOŚĆ — POMINIĘTA ===\n' +
                '  Brak snapshotu sprzed przejęcia. Podaj --before <plik.jsonl>,\n' +
                '  inaczej nie da się stwierdzić, czy czegoś nie zgubiono.'
        );
    }

    const foreignN = total - (byOwner.get(master) ?? 0);
    console.log(
        foreignN === 0 && missing.length === 0
            ? '\n[verify] ✅ PRZEJĘCIE KOMPLETNE — całe drzewo należy do mastera, nic nie zginęło.'
            : '\n[verify] ⚠ PRZEJĘCIE NIEDOKOŃCZONE — NIE przeciągaj na Shared Drive.'
    );
}

// ---------- tryb: przejęcie drzewa (transfer + copy, BEZ shared drive) ----------
/**
 * Ujednolica własność całego drzewa do konta master, W MIEJSCU:
 *   - obiekt (plik/folder) właściciela, którego TOKEN mamy → TRANSFER własności
 *     na master (ID + historia zachowane, nic się nie przenosi),
 *   - plik właściciela BEZ tokenu → COPY jako master (nowe ID); oryginał trafia
 *     do lustrzanego archiwum (--archive) albo jest odpinany (--unlink-originals),
 *   - folder właściciela BEZ tokenu → oryginał jedzie W CAŁOŚCI do archiwum,
 *     a w jego miejsce powstaje zamiennik pod masterem (nowe ID).
 *
 * KOLEJNOŚĆ: cudzy folder jest archiwizowany PRZED utworzeniem zamiennika.
 * Odwrotna kolejność zostawiała w jednym rodzicu dwa foldery o tej samej nazwie
 * na cały czas przetwarzania poddrzewa — a aplikacja szuka folderów po
 * (rodzic + nazwa), więc mogła trafić w niewłaściwy.
 *
 * Mapa oldId→newId (kopie i zamienniki) zapisywana PRZYROSTOWO do .jsonl —
 * awaria po godzinach nie kasuje wiedzy potrzebnej do reindexu bazy.
 */
async function takeoverMode(clients: Clients) {
    const rootId = arg('takeover');
    if (!rootId || rootId === 'true')
        throw new Error('Podaj --takeover <folderId>.');
    const apply = flag('apply');
    const unlink = flag('unlink-originals');
    const archiveRoot = arg('archive');
    if (archiveRoot === 'true')
        throw new Error('Podaj --archive <folderId> (folder archiwum).');
    const concurrency = Math.max(1, Number(arg('concurrency', '10')) || 10);
    const master = clients.masterEmail;
    const masterDrive = google.drive({
        version: 'v3',
        auth: clients.byEmail.get(master)!,
    });

    const stat = {
        alreadyOwn: 0,
        transferred: 0,
        copied: 0,
        foldersReplaced: 0,
        archived: 0,
        unlinked: 0,
        blockedOriginals: 0,
        errors: 0,
    };
    const MAP_FILE = 'gd-takeover-map.json';
    const MAP_LOG = 'gd-takeover-map.jsonl';
    const failures: string[] = [];

    /** wcześniej zapisane pary oldId→newId (wznawianie po przerwaniu) */
    const done = new Map<string, string>();
    if (existsSync(MAP_LOG))
        for (const line of readFileSync(MAP_LOG, 'utf8').split('\n')) {
            if (!line.trim()) continue;
            try {
                const parsed = JSON.parse(line);
                if (parsed.old && parsed.new) done.set(parsed.old, parsed.new);
            } catch {}
        }
    /** Mapa nie jest pusta ⇒ to wznowienie po przerwanym przebiegu. Tylko wtedy
     *  płacimy za dodatkowe files.list szukające obiektów utworzonych, ale
     *  jeszcze nie odnotowanych w mapie. */
    const resumingTakeover = done.size > 0;
    const idMap: Record<string, string> = {};

    function recordMapping(oldId: string, newId: string) {
        idMap[oldId] = newId;
        done.set(oldId, newId);
        if (apply)
            appendFileSync(
                MAP_LOG,
                JSON.stringify({ old: oldId, new: newId }) + '\n',
                'utf8'
            );
    }

    console.log(
        `[takeover] ${apply ? 'APPLY' : 'DRY-RUN'}  root=${rootId}  master=${master}` +
            `\n[takeover] Współbieżność: ${concurrency}  |  tokeny: ${clients.byEmail.size} kont` +
            (done.size ? `\n[takeover] Wznawianie: ${done.size} par w mapie` : '') +
            `\n[takeover] Oryginały bez tokenu: ${
                archiveRoot
                    ? `ARCHIWUM lustrzane (${archiveRoot})`
                    : unlink
                      ? 'odpinane'
                      : 'zostają w miejscu'
            }\n`
    );

    async function transferToMaster(fileId: string, owner: string) {
        const fromDrive = google.drive({
            version: 'v3',
            auth: clients.byEmail.get(owner)!,
        });
        const perms =
            (
                await withRetry(() =>
                    fromDrive.permissions.list({
                        fileId,
                        fields: 'permissions(id,emailAddress,role,pendingOwner)',
                    })
                )
            ).data.permissions ?? [];
        let mp = perms.find(
            (p) => (p.emailAddress || '').toLowerCase() === master
        );
        if (mp) {
            await withRetry(() =>
                fromDrive.permissions.update({
                    fileId,
                    permissionId: mp!.id!,
                    requestBody: { role: 'writer', pendingOwner: true },
                })
            );
        } else {
            mp = (
                await withRetry(() =>
                    fromDrive.permissions.create({
                        fileId,
                        requestBody: {
                            type: 'user',
                            role: 'writer',
                            emailAddress: master,
                            pendingOwner: true,
                        },
                        // Bez tego Google wysyla maila przy KAZDYM zaproszeniu —
                        // przy ~250 tys. obiektow to 250 tys. wiadomosci do
                        // mastera i niemal pewne dlawienie API.
                        sendNotificationEmail: false,
                        fields: 'id',
                    })
                )
            ).data;
        }
        await withRetry(() =>
            masterDrive.permissions.update({
                fileId,
                permissionId: mp!.id!,
                requestBody: { role: 'owner' },
                transferOwnership: true,
            })
        );
    }

    async function moveOwn(id: string, fromParent: string, toParent: string) {
        await withRetry(() =>
            masterDrive.files.update({
                fileId: id,
                addParents: toParent,
                removeParents: fromParent,
                fields: 'id',
            })
        );
    }

    /** cache ścieżek archiwum: '/A/B' -> folderId */
    const mirrorCache = new Map<string, string>();
    /** blokady per ścieżka — przy współbieżności kilku workerów mogłoby
     *  utworzyć ten sam segment archiwum naraz i powstałyby duplikaty */
    const mirrorLocks = new Map<string, Promise<string>>();

    async function ensureArchivePath(pathSegs: string[]): Promise<string> {
        let parent = archiveRoot!;
        let key = '';
        for (const seg of pathSegs) {
            key += '/' + seg;
            const cached = mirrorCache.get(key);
            if (cached) {
                parent = cached;
                continue;
            }
            const inFlight = mirrorLocks.get(key);
            if (inFlight) {
                parent = await inFlight;
                continue;
            }
            const parentNow = parent;
            const segNow = seg;
            const keyNow = key;
            const promise = (async () => {
                const escaped = segNow.replace(/'/g, "\\'");
                const found = (
                    await withRetry(() =>
                        masterDrive.files.list({
                            q: `name = '${escaped}' and '${parentNow}' in parents and mimeType = '${FOLDER}' and trashed = false`,
                            fields: 'files(id)',
                            pageSize: 1,
                        })
                    )
                ).data.files?.[0];
                let id = found?.id;
                if (!id)
                    id = (
                        await withRetry(() =>
                            masterDrive.files.create({
                                requestBody: {
                                    name: segNow,
                                    parents: [parentNow],
                                    mimeType: FOLDER,
                                },
                                fields: 'id',
                            })
                        )
                    ).data.id!;
                mirrorCache.set(keyNow, id);
                return id;
            })();
            mirrorLocks.set(key, promise);
            parent = await promise;
        }
        return parent;
    }

    /** Przenosi cudzy oryginał do lustrzanego archiwum. Zwraca true przy sukcesie. */
    async function moveToArchive(
        id: string,
        fromParent: string,
        pathSegs: string[],
        name: string
    ): Promise<boolean> {
        try {
            const mirrorId = await ensureArchivePath(pathSegs);
            await withRetry(() =>
                masterDrive.files.update({
                    fileId: id,
                    addParents: mirrorId,
                    removeParents: fromParent,
                    fields: 'id',
                })
            );
            stat.archived++;
            return true;
        } catch (err: any) {
            stat.blockedOriginals++;
            failures.push(
                `ORYGINAL ZOSTAL W DRZEWIE (zablokuje drag): /${[...pathSegs, name].join('/')} — ${err.message} ${reason(err)}`
            );
            return false;
        }
    }

    async function unlinkOriginal(
        id: string,
        parentId: string,
        name: string,
        pathSegs: string[]
    ): Promise<boolean> {
        try {
            await withRetry(() =>
                masterDrive.files.update({
                    fileId: id,
                    removeParents: parentId,
                    fields: 'id',
                })
            );
            stat.unlinked++;
            return true;
        } catch (err: any) {
            stat.blockedOriginals++;
            failures.push(
                `ORYGINAL ZOSTAL W DRZEWIE: /${[...pathSegs, name].join('/')} — ${err.message} ${reason(err)}`
            );
            return false;
        }
    }

    /**
     * Szuka w folderze docelowym elementu o danej nazwie — używane WYŁĄCZNIE
     * przy wznawianiu. Obiekt mógł powstać w przerwanym przebiegu, zanim jego
     * para trafiła do mapy; bez tego sprawdzenia zrobilibyśmy duplikat.
     * Dla plików binarnych wymagamy zgodności rozmiaru — inny rozmiar oznacza
     * inny plik o tej samej nazwie, a nie naszą kopię.
     */
    async function findExistingChild(
        parentId: string,
        name: string,
        isFolder: boolean,
        excludeId: string,
        size = 0
    ): Promise<string | undefined> {
        if (!apply || !resumingTakeover) return undefined;
        const escaped = name.replace(/'/g, "\\'");
        const mime = isFolder ? '=' : '!=';
        const found = (
            (
                await withRetry(() =>
                    masterDrive.files.list({
                        q:
                            `name = '${escaped}' and '${parentId}' in parents and trashed = false` +
                            ` and mimeType ${mime} '${FOLDER}'`,
                        fields: 'files(id,size,ownedByMe)',
                        pageSize: 20,
                        supportsAllDrives: true,
                        includeItemsFromAllDrives: true,
                    })
                )
            ).data.files ?? []
        ).filter(
            // Przejęcie działa W MIEJSCU: oryginał leży w tym samym folderze
            // co zamiennik i ma tę samą nazwę. Odróżnia je właściciel —
            // zamiennik/kopię tworzy master, oryginał jest cudzy.
            (f) => f.id !== excludeId && f.ownedByMe === true
        );
        if (isFolder || !size) return found[0]?.id ?? undefined;
        return found.find((f) => Number(f.size) === size)?.id ?? undefined;
    }

    type TJob = {
        srcId: string;
        dstId: string;
        path: string[];
        inArchived: boolean;
    };
    const queue: TJob[] = [];
    let activeWorkers = 0;
    let processed = 0;

    async function processFolder(job: TJob) {
        const relocated = job.srcId !== job.dstId;
        const children = await listChildren(masterDrive, job.srcId);
        for (const c of children) {
            const owner = ownerOf(c, master);
            const name = c.name || '(bez nazwy)';
            const isFolder = c.mimeType === FOLDER;
            const hasToken = clients.byEmail.has(owner);
            const childPath = [...job.path, name];

            // 1) już własność mastera
            if (owner === master) {
                if (relocated && apply) {
                    try {
                        await moveOwn(c.id!, job.srcId, job.dstId);
                    } catch (err: any) {
                        stat.errors++;
                        failures.push(
                            `przeniesienie wlasnego /${childPath.join('/')}: ${err.message}`
                        );
                    }
                } else stat.alreadyOwn++;
                if (isFolder)
                    queue.push({
                        srcId: c.id!,
                        dstId: c.id!,
                        path: childPath,
                        inArchived: false,
                    });
                continue;
            }

            // 2) mamy token → TRANSFER własności (ID i historia bez zmian)
            if (hasToken) {
                let ok = !apply;
                if (apply) {
                    try {
                        await transferToMaster(c.id!, owner);
                        stat.transferred++;
                        ok = true;
                        if (relocated) await moveOwn(c.id!, job.srcId, job.dstId);
                    } catch (err: any) {
                        stat.errors++;
                        failures.push(
                            `transfer /${childPath.join('/')} (${owner}): ${err.message} ${reason(err)}`
                        );
                    }
                } else stat.transferred++;
                if (isFolder)
                    queue.push({
                        srcId: c.id!,
                        dstId: ok ? c.id! : job.dstId,
                        path: childPath,
                        inArchived: ok ? false : job.inArchived,
                    });
                continue;
            }

            // 3) brak tokenu
            if (isFolder) {
                // KOLEJNOŚĆ: zamiennik → zapis mapy → archiwum oryginału.
                // Okno z dwoma folderami o tej samej nazwie trwa dwa wywołania
                // API (milisekundy), a nie — jak wcześniej — cały czas
                // przetwarzania poddrzewa. Awaria w tym oknie jest naprawialna:
                // oryginał wciąż jest w drzewie, a mapa zna już zamiennik, więc
                // wznowienie go użyje i dokończy archiwizację.
                stat.foldersReplaced++;
                let newId = `dry:${c.id}`;
                if (apply) {
                    const reuse =
                        done.get(c.id!) ??
                        (await findExistingChild(
                            job.dstId,
                            name,
                            true,
                            c.id!
                        ));
                    if (reuse) {
                        newId = reuse;
                        if (!done.has(c.id!)) recordMapping(c.id!, newId);
                    } else {
                        try {
                            const res = await withRetry(() =>
                                masterDrive.files.create({
                                    requestBody: {
                                        name,
                                        parents: [job.dstId],
                                        mimeType: FOLDER,
                                    },
                                    fields: 'id',
                                })
                            );
                            newId = res.data.id!;
                            recordMapping(c.id!, newId);
                        } catch (err: any) {
                            stat.errors++;
                            failures.push(
                                `zamiennik /${childPath.join('/')}: ${err.message}`
                            );
                            continue;
                        }
                    }
                }
                let archivedOk = job.inArchived;
                if (!job.inArchived && apply) {
                    if (archiveRoot)
                        archivedOk = await moveToArchive(
                            c.id!,
                            job.srcId,
                            job.path,
                            name
                        );
                    else if (unlink)
                        archivedOk = await unlinkOriginal(
                            c.id!,
                            job.srcId,
                            name,
                            job.path
                        );
                }
                queue.push({
                    srcId: c.id!,
                    dstId: newId,
                    path: childPath,
                    inArchived:
                        archiveRoot || unlink ? archivedOk : job.inArchived,
                });
            } else {
                if (done.has(c.id!)) {
                    stat.copied++;
                    continue; // skopiowany we wcześniejszym przebiegu
                }
                if (apply) {
                    // Kopia mogła powstać w przerwanym przebiegu ZANIM trafiła
                    // do mapy — wtedy w miejscu docelowym leży już plik o tej
                    // samej nazwie i rozmiarze. Bez tego sprawdzenia wznowienie
                    // tworzyłoby duplikat.
                    let copyId = await findExistingChild(
                        job.dstId,
                        name,
                        false,
                        c.id!,
                        Number(c.size) || 0
                    );
                    if (!copyId) {
                        try {
                            const res = await withRetry(() =>
                                masterDrive.files.copy({
                                    fileId: c.id!,
                                    requestBody: {
                                        name,
                                        parents: [job.dstId],
                                    },
                                    fields: 'id',
                                })
                            );
                            copyId = res.data.id!;
                        } catch (err: any) {
                            stat.errors++;
                            failures.push(
                                `kopia /${childPath.join('/')}: ${err.message} ${reason(err)}`
                            );
                            continue; // bez udanej kopii NIE ruszamy oryginału
                        }
                    }
                    recordMapping(c.id!, copyId);
                    stat.copied++;
                    if (!job.inArchived) {
                        if (archiveRoot)
                            await moveToArchive(
                                c.id!,
                                job.srcId,
                                job.path,
                                name
                            );
                        else if (unlink)
                            await unlinkOriginal(
                                c.id!,
                                job.srcId,
                                name,
                                job.path
                            );
                    }
                } else stat.copied++;
            }
        }
        processed++;
        if (processed % 20 === 0)
            progress(
                `\r[takeover] foldery: ${processed}, kolejka: ${queue.length}, transfer: ${stat.transferred}, kopie: ${stat.copied}, archiwum: ${stat.archived}, blad: ${stat.errors}, ponowienia: ${retryCount}   `
            );
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
                await processFolder(job);
            } catch (err: any) {
                stat.errors++;
                failures.push(
                    `folder /${job.path.join('/')}: ${err.message} ${reason(err)}`
                );
            } finally {
                activeWorkers--;
            }
        }
    }

    // root: jeśli cudzy, a mamy token — też przejmij
    const rootMeta = (
        await withRetry(() =>
            masterDrive.files.get({
                fileId: rootId,
                fields: 'id,name,mimeType,ownedByMe,owners(emailAddress)',
                supportsAllDrives: true,
            })
        )
    ).data;
    const rootOwner = ownerOf(rootMeta, master);
    if (rootOwner !== master && clients.byEmail.has(rootOwner)) {
        console.log(`[TRANSFER] root "${rootMeta.name}"  (${rootOwner})`);
        if (apply) {
            try {
                await transferToMaster(rootId, rootOwner);
                stat.transferred++;
            } catch (err: any) {
                stat.errors++;
                failures.push(`transfer roota: ${err.message}`);
            }
        } else stat.transferred++;
    }

    // SNAPSHOT PRZED — bez niego nie da się po fakcie udowodnić, że nic nie
    // zginęło, bo takeover modyfikuje oryginały (transfer, przeniesienie do archiwum)
    if (apply && !flag('no-snapshot')) {
        const snapFile = `gd-takeover-before-${rootId}.jsonl`;
        console.log(`[takeover] Snapshot stanu PRZED → ${snapFile} ...`);
        const n = await snapshotTree(masterDrive, rootId, master, snapFile);
        console.log(`[takeover] Zapisano ${n} obiektów\n`);
    }

    queue.push({ srcId: rootId, dstId: rootId, path: [], inArchived: false });
    await Promise.all(Array.from({ length: concurrency }, worker));
    console.log();

    // konsolidacja mapy: .jsonl (przyrostowy) → .json
    if (apply && Object.keys(idMap).length) {
        const merged: Record<string, string> = {};
        if (existsSync(MAP_FILE)) {
            try {
                Object.assign(
                    merged,
                    JSON.parse(readFileSync(MAP_FILE, 'utf8'))
                );
            } catch {}
        }
        if (existsSync(MAP_LOG))
            for (const line of readFileSync(MAP_LOG, 'utf8').split('\n')) {
                if (!line.trim()) continue;
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.old && parsed.new)
                        merged[parsed.old] = parsed.new;
                } catch {}
            }
        Object.assign(merged, idMap);
        writeFileSync(MAP_FILE, JSON.stringify(merged, null, 2), 'utf8');
        console.log(
            `\n[takeover] Mapa przyrostowa: ${MAP_LOG} (${Object.keys(idMap).length} par w tym przebiegu)` +
                `\n[takeover] Skonsolidowana:   ${MAP_FILE} (${Object.keys(merged).length} par lacznie)`
        );
    }

    if (failures.length) {
        writeFileSync('gd-takeover-failures.txt', failures.join('\n'), 'utf8');
        console.log(`\n[takeover] Lista problemow: gd-takeover-failures.txt`);
    }

    console.log('\n=== PODSUMOWANIE PRZEJĘCIA ===');
    console.log(`  Przetworzonych folderow:   ${processed}`);
    console.log(`  Juz wlasnosc mastera:      ${stat.alreadyOwn}`);
    console.log(
        `  TRANSFER wlasnosci:        ${stat.transferred}   (ID i historia zachowane)`
    );
    console.log(
        `  COPY (bez tokenu):         ${stat.copied}   (nowe ID → reindex)`
    );
    console.log(
        `  Foldery zastapione:        ${stat.foldersReplaced}   (nowe ID → reindex)`
    );
    console.log(`  Zarchiwizowane oryginaly:  ${stat.archived}`);
    console.log(`  Odpiete oryginaly:         ${stat.unlinked}`);
    console.log(
        `  ⛔ Oryginaly ZOSTALY w drzewie: ${stat.blockedOriginals}   (zablokuja przeciagniecie!)`
    );
    console.log(`  ❌ Bledy:                  ${stat.errors}`);
    console.log(`  Ponowienia API:            ${retryCount}`);
    if (!apply)
        console.log('\n[takeover] DRY-RUN — dodaj --apply, aby wykonac.');
    else if (stat.blockedOriginals > 0)
        console.log(
            '\n[takeover] ⚠ Czesc oryginalow zostala w drzewie — przeciagniecie na Shared Drive NIE przejdzie,' +
                '\n            dopoki nie zdobedziesz tokenow ich wlascicieli albo praw edycji.'
        );
}

// ---------- tryb: migracja ----------
type Stat = {
    movedFiles: number;
    movedFolders: number;
    copied: number;
    recreated: number;
    carried: number;
    errors: number;
};

async function migrateMode(clients: Clients) {
    const source = arg('source');
    const target = arg('target');
    if (!source || !target)
        throw new Error('Podaj --source i --target.');
    // UWAGA: yarn v1 potrafi zamienić przecinki w argumencie na spacje,
    // dlatego dzielimy po przecinkach ORAZ białych znakach.
    const moveOwners = new Set(
        (arg('move-owners') || clients.masterEmail)
            .split(/[,\s]+/)
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean)
    );
    const apply = flag('apply');
    const moveFolders = flag('move-folders');
    const masterDrive = google.drive({
        version: 'v3',
        auth: clients.byEmail.get(clients.masterEmail)!,
    });

    console.log(
        `[migrate] ${apply ? 'APPLY' : 'DRY-RUN'}  source=${source} → target=${target}`
    );
    console.log(`[migrate] MOVE dla: ${[...moveOwners].join(', ')}`);
    console.log('[migrate] (właściciele spoza listy → COPY)\n');

    const stat: Stat = {
        movedFiles: 0,
        movedFolders: 0,
        copied: 0,
        recreated: 0,
        carried: 0,
        errors: 0,
    };

    const canMove = (owner: string) =>
        moveOwners.has(owner) && clients.byEmail.has(owner);

    // Google API NIE wspiera przenoszenia folderów My Drive → Shared Drive.
    // Po pierwszym takim błędzie przestajemy próbować (oszczędza setki wywołań).
    let folderMoveSupported = moveFolders;
    let folderMoveNoticeShown = false;

    /** Przenosi obiekt KONTEM WŁAŚCICIELA (tylko właściciel może wrzucić na Shared Drive). */
    async function moveObject(
        id: string,
        owner: string,
        fromParent: string,
        toParent: string
    ) {
        const d = google.drive({
            version: 'v3',
            auth: clients.byEmail.get(owner)!,
        });
        await withRetry(() =>
            d.files.update({
                fileId: id,
                addParents: toParent,
                removeParents: fromParent, // tylko z folderu źródłowego
                supportsAllDrives: true,
                fields: 'id',
            })
        );
    }

    /**
     * @param preChildren lista dzieci sprzed przeniesienia rodzica (gdy rodzic był MOVE-owany)
     */
    async function migrate(
        srcFolderId: string,
        targetParentId: string,
        indent: string,
        preChildren?: drive_v3.Schema$File[]
    ) {
        const children =
            preChildren ?? (await listChildren(masterDrive, srcFolderId));
        // Gdy rodzic został przeniesiony, src i target to ten sam folder:
        // część dzieci "pojechała" z nim, część wypadła.
        const sameParent = srcFolderId === targetParentId;
        let presentIds: Set<string> | null = null;
        if (sameParent && apply)
            presentIds = new Set(
                (await listChildren(masterDrive, srcFolderId)).map((f) => f.id!)
            );

        for (const c of children) {
            const owner = ownerOf(c, clients.masterEmail);
            const name = c.name || '(bez nazwy)';
            const mine = canMove(owner);
            // w dry-run przewidujemy: własne pojadą z rodzicem, cudze wypadną
            const carried = sameParent && (presentIds ? presentIds.has(c.id!) : mine);

            if (c.mimeType === FOLDER) {
                if (carried) {
                    console.log(`${indent}[FOLDER ✓] ${name}  (pojechał z rodzicem)`);
                    stat.carried++;
                    await migrate(c.id!, c.id!, indent + '  ');
                    continue;
                }
                if (folderMoveSupported && mine) {
                    console.log(
                        `${indent}[FOLDER→MOVE] ${name}  (właściciel ${owner})`
                    );
                    if (!apply) {
                        stat.movedFolders++;
                        await migrate(c.id!, c.id!, indent + '  ');
                        continue;
                    }
                    const before = await listChildren(masterDrive, c.id!);
                    try {
                        await moveObject(c.id!, owner, srcFolderId, targetParentId);
                        stat.movedFolders++;
                        const after = await listChildren(masterDrive, c.id!);
                        const present = new Set(after.map((f) => f.id!));
                        const evicted = before.filter((b) => !present.has(b.id!));
                        console.log(
                            `${indent}  → OK (ID zachowane). W środku zostało ${after.length}, wypadło ${evicted.length}`
                        );
                        await migrate(c.id!, c.id!, indent + '  ', before);
                        continue;
                    } catch (err: any) {
                        const r = reason(err);
                        const unsupported =
                            /teamDrivesFolderMoveInNotSupported/i.test(r) ||
                            /Moving folders into shared drives is not supported/i.test(
                                err.message || ''
                            );
                        if (unsupported) {
                            folderMoveSupported = false; // nie próbuj więcej
                            if (!folderMoveNoticeShown) {
                                console.warn(
                                    `${indent}  ⓘ Google API NIE pozwala przenosić folderów My Drive → Shared Drive`
                                );
                                console.warn(
                                    `${indent}    (teamDrivesFolderMoveInNotSupported). Wszystkie foldery będą ODTWARZANE (nowe ID).`
                                );
                                folderMoveNoticeShown = true;
                            }
                        } else {
                            console.error(
                                `${indent}  ✗ FOLDER-MOVE: ${err.message} ${r} → odtwarzam zamiast przenosić`
                            );
                            stat.errors++;
                        }
                    }
                }
                console.log(`${indent}[FOLDER] ${name}  (odtwórz)`);
                stat.recreated++;
                let newFolderId = 'dry-folder';
                if (apply) {
                    try {
                        const res = await withRetry(() =>
                            masterDrive.files.create({
                                requestBody: {
                                    name,
                                    parents: [targetParentId],
                                    mimeType: FOLDER,
                                },
                                fields: 'id',
                                supportsAllDrives: true,
                            })
                        );
                        newFolderId = res.data.id!;
                    } catch (err: any) {
                        console.error(`${indent}  ✗ create folder: ${err.message}`);
                        stat.errors++;
                        continue;
                    }
                }
                await migrate(c.id!, newFolderId, indent + '  ');
                continue;
            }

            // plik / skrót
            if (carried) {
                console.log(`${indent}[PLIK ✓] ${name}  (pojechał z rodzicem)`);
                stat.carried++;
                continue;
            }
            if (mine) {
                console.log(`${indent}[MOVE ] ${name}  (właściciel ${owner})`);
                stat.movedFiles++;
                if (apply) {
                    try {
                        await moveObject(c.id!, owner, srcFolderId, targetParentId);
                    } catch (err: any) {
                        console.error(
                            `${indent}  ✗ MOVE ${name}: ${err.message} ${reason(err)}`
                        );
                        stat.errors++;
                    }
                }
            } else {
                const why = moveOwners.has(owner)
                    ? 'brak tokenu właściciela'
                    : 'właściciel spoza listy';
                console.log(`${indent}[COPY ] ${name}  (${owner}; ${why})`);
                stat.copied++;
                if (apply) {
                    try {
                        await withRetry(() =>
                            masterDrive.files.copy({
                                fileId: c.id!,
                                requestBody: { name, parents: [targetParentId] },
                                supportsAllDrives: true,
                                fields: 'id',
                            })
                        );
                    } catch (err: any) {
                        console.error(
                            `${indent}  ✗ COPY ${name}: ${err.message} ${reason(err)}`
                        );
                        stat.errors++;
                    }
                }
            }
        }
    }

    await migrate(source, target, '');

    console.log('\n=== PODSUMOWANIE ===');
    console.log(`  Foldery PRZENIESIONE (ID zachowane): ${stat.movedFolders}`);
    console.log(`  Foldery odtworzone (nowe ID):        ${stat.recreated}`);
    console.log(`  Pliki MOVE (ID zachowane):           ${stat.movedFiles}`);
    console.log(`  Pliki/foldery COPY (nowe ID):        ${stat.copied}`);
    console.log(`  Pojechały z rodzicem:                ${stat.carried}`);
    console.log(`  Błędy:                               ${stat.errors}`);
    if (!apply)
        console.log('\n[migrate] To był DRY-RUN. Dodaj --apply, aby wykonać.');
}

// ---------- tryb: cleanup ----------
async function cleanupMode(clients: Clients) {
    const folderId = arg('cleanup');
    if (!folderId || folderId === 'true')
        throw new Error('Podaj --cleanup <folderId>.');
    const apply = flag('apply');
    const drive = google.drive({
        version: 'v3',
        auth: clients.byEmail.get(clients.masterEmail)!,
    });
    const children = await listChildren(drive, folderId);
    console.log(
        `[cleanup] ${apply ? 'APPLY' : 'DRY-RUN'} — usunę ${children.length} elementów z ${folderId}`
    );
    for (const c of children) {
        console.log(`  ${apply ? 'usuwam' : '[dry] usunąłbym'}: ${c.name}`);
        if (apply) {
            try {
                await withRetry(() =>
                    drive.files.delete({
                        fileId: c.id!,
                        supportsAllDrives: true,
                    })
                );
            } catch (err: any) {
                console.error(`  ✗ ${c.name}: ${err.message}`);
            }
        }
    }
    if (!apply) console.log('[cleanup] DRY-RUN. Dodaj --apply, aby usunąć.');
}

async function main() {
    if (flag('get-token')) return getTokenMode();
    const clients = await loadClients();
    if (flag('inspect')) return inspectMode(clients);
    if (arg('cleanup')) return cleanupMode(clients);
    if (arg('transfer')) return transferMode(clients);
    if (arg('verify-takeover')) return verifyTakeoverMode(clients);
    if (arg('takeover')) return takeoverMode(clients);
    return migrateMode(clients);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[gd-move-test] Błąd:', err.message || err);
        process.exit(1);
    });
