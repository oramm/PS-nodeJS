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
async function withRetry<T>(fn: () => Promise<T>, max = 6): Promise<T> {
    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (err: any) {
            if (retryable(err) && attempt < max) {
                await sleep(
                    Math.min(2 ** attempt * 500, 16000) +
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
                fields: 'nextPageToken, files(id,name,mimeType,ownedByMe,owners(emailAddress),parents)',
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

// ---------- tryb: przejęcie drzewa (transfer + copy, BEZ shared drive) ----------
/**
 * Ujednolica własność całego drzewa do konta master, W MIEJSCU:
 *   - obiekt (plik/folder) właściciela, którego TOKEN mamy → TRANSFER własności
 *     na master (ID + historia zachowane, nic się nie przenosi),
 *   - plik właściciela BEZ tokenu → COPY jako master do tego samego folderu
 *     (nowe ID); oryginał: --archive <folderId> → przeniesiony do lustrzanego
 *     archiwum, --unlink-originals → odpięty, bez flag → zostaje w miejscu,
 *   - folder właściciela BEZ tokenu → folder zastępczy pod master (nowe ID);
 *     własne/transferowane dzieci przenoszone do zastępczego, cudze pliki
 *     kopiowane; oryginał folderu (z cudzymi oryginałami w środku) jedzie
 *     W CAŁOŚCI do archiwum — łatwa identyfikacja po tej samej ścieżce.
 * Mapę oldId→newId (kopie i foldery zastępcze) dopisuje do gd-takeover-map.json
 * — to artefakt pod przyszły mini-reindex bazy.
 */
async function takeoverMode(clients: Clients) {
    const rootId = arg('takeover');
    if (!rootId || rootId === 'true')
        throw new Error('Podaj --takeover <folderId>.');
    const apply = flag('apply');
    const unlink = flag('unlink-originals');
    const archiveRoot = arg('archive'); // ID folderu archiwum (My Drive mastera)
    if (archiveRoot === 'true')
        throw new Error('Podaj --archive <folderId> (folder archiwum).');
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
        errors: 0,
    };
    const idMap: Record<string, string> = {};
    const MAP_FILE = 'gd-takeover-map.json';
    const MAP_LOG = 'gd-takeover-map.jsonl';

    /**
     * Zapisuje parę oldId→newId PRZYROSTOWO (append do .jsonl) natychmiast po
     * wykonaniu operacji. Dzięki temu awaria po wielu godzinach nie kasuje mapy
     * — bez niej kopie istnieją, ale nie wiadomo, co na co przemapować w bazie.
     */
    function recordMapping(oldId: string, newId: string) {
        idMap[oldId] = newId;
        if (apply)
            appendFileSync(
                MAP_LOG,
                JSON.stringify({ old: oldId, new: newId }) + '\n',
                'utf8'
            );
    }

    console.log(
        `[takeover] ${apply ? 'APPLY' : 'DRY-RUN'}  root=${rootId}  master=${master}` +
            `\n[takeover] Tokeny: ${[...clients.byEmail.keys()].join(', ')}` +
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

    /** master przenosi WŁASNY obiekt między folderami My Drive (nie shared drive) */
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

    async function unlinkOriginal(id: string, parentId: string, name: string, indent: string) {
        try {
            await withRetry(() =>
                masterDrive.files.update({
                    fileId: id,
                    removeParents: parentId,
                    fields: 'id',
                })
            );
            stat.unlinked++;
        } catch (err: any) {
            console.error(
                `${indent}  ✗ odpięcie oryginału "${name}": ${err.message} ${reason(err)}`
            );
            stat.errors++;
        }
    }

    /** cache ścieżek archiwum: '/A/B' -> folderId */
    const mirrorCache = new Map<string, string>();

    /** Zwraca (tworząc leniwie) folder archiwum odpowiadający ścieżce źródłowej. */
    async function ensureArchivePath(path: string[]): Promise<string> {
        let parent = archiveRoot!;
        let key = '';
        for (const seg of path) {
            key += '/' + seg;
            const cached = mirrorCache.get(key);
            if (cached) {
                parent = cached;
                continue;
            }
            // znajdź istniejący (idempotencja/wznawianie) albo utwórz
            const escaped = seg.replace(/'/g, "\\'");
            const found = (
                await withRetry(() =>
                    masterDrive.files.list({
                        q: `name = '${escaped}' and '${parent}' in parents and mimeType = '${FOLDER}' and trashed = false`,
                        fields: 'files(id)',
                        pageSize: 1,
                    })
                )
            ).data.files?.[0];
            let id = found?.id;
            if (!id) {
                id = (
                    await withRetry(() =>
                        masterDrive.files.create({
                            requestBody: {
                                name: seg,
                                parents: [parent],
                                mimeType: FOLDER,
                            },
                            fields: 'id',
                        })
                    )
                ).data.id!;
            }
            mirrorCache.set(key, id);
            parent = id;
        }
        return parent;
    }

    /** Przenosi cudzy oryginał do lustrzanego archiwum (master jako edytor). */
    async function moveToArchive(
        id: string,
        fromParent: string,
        path: string[],
        name: string,
        indent: string
    ) {
        try {
            const mirrorId = await ensureArchivePath(path);
            await withRetry(() =>
                masterDrive.files.update({
                    fileId: id,
                    addParents: mirrorId,
                    removeParents: fromParent,
                    fields: 'id',
                })
            );
            stat.archived++;
        } catch (err: any) {
            console.error(
                `${indent}  ✗ archiwizacja "${name}": ${err.message} ${reason(err)} (oryginał został w drzewie)`
            );
            stat.errors++;
        }
    }

    /**
     * @param folderId  folder źródłowy (listowany)
     * @param targetId  dokąd mają trafić dzieci (== folderId, gdy folder nie był zastąpiony)
     * @param path      ścieżka nazw od roota (do lustrzanego archiwum)
     * @param inArchived true, gdy jesteśmy w cudzym folderze, który W CAŁOŚCI jedzie do archiwum
     */
    async function walk(
        folderId: string,
        targetId: string,
        path: string[],
        inArchived: boolean,
        indent: string
    ) {
        const relocated = folderId !== targetId;
        const children = await listChildren(masterDrive, folderId);
        for (const c of children) {
            const owner = ownerOf(c, master);
            const name = c.name || '(bez nazwy)';
            const isFolder = c.mimeType === FOLDER;
            const hasToken = clients.byEmail.has(owner);

            // 1) już własność mastera
            if (owner === master) {
                if (relocated) {
                    console.log(`${indent}[PRZENIEŚ] ${name}  (własny → do folderu zastępczego)`);
                    if (apply) {
                        try {
                            await moveOwn(c.id!, folderId, targetId);
                        } catch (err: any) {
                            console.error(`${indent}  ✗ ${err.message}`);
                            stat.errors++;
                        }
                    }
                } else {
                    stat.alreadyOwn++;
                }
                if (isFolder)
                    await walk(c.id!, c.id!, [...path, name], false, indent + '  ');
                continue;
            }

            // 2) mamy token właściciela → TRANSFER
            if (hasToken) {
                console.log(
                    `${indent}[TRANSFER] ${isFolder ? 'folder' : 'plik'} "${name}"  (${owner})`
                );
                let transferOk = !apply; // w dry-run zakładamy sukces
                if (apply) {
                    try {
                        await transferToMaster(c.id!, owner);
                        stat.transferred++;
                        transferOk = true;
                        if (relocated) await moveOwn(c.id!, folderId, targetId);
                    } catch (err: any) {
                        console.error(
                            `${indent}  ✗ transfer: ${err.message} ${reason(err)}`
                        );
                        stat.errors++;
                    }
                } else {
                    stat.transferred++;
                }
                if (isFolder) {
                    // po udanym transferze folder jest własny → dzieci zostają w nim
                    if (transferOk)
                        await walk(c.id!, c.id!, [...path, name], false, indent + '  ');
                    else
                        await walk(c.id!, targetId, [...path, name], inArchived, indent + '  '); // awaryjnie przenieś zawartość wyżej
                }
                continue;
            }

            // 3) brak tokenu
            if (isFolder) {
                console.log(
                    `${indent}[ZASTĄP] folder "${name}"  (${owner}; bez tokenu → zamiennik pod master)`
                );
                stat.foldersReplaced++;
                let newId = `dry:${c.id}`;
                if (apply) {
                    try {
                        // idempotencja: po wznowieniu użyj istniejącego zamiennika
                        // (własność mastera, ta sama nazwa) zamiast tworzyć duplikat
                        const escaped = name.replace(/'/g, "\\'");
                        const existingReplacement = (
                            await withRetry(() =>
                                masterDrive.files.list({
                                    q: `name = '${escaped}' and '${targetId}' in parents and mimeType = '${FOLDER}' and trashed = false and 'me' in owners`,
                                    fields: 'files(id)',
                                    pageSize: 1,
                                })
                            )
                        ).data.files?.[0];
                        if (existingReplacement?.id) {
                            newId = existingReplacement.id;
                            console.log(
                                `${indent}  ↺ zamiennik już istnieje — używam go`
                            );
                        } else {
                            const res = await withRetry(() =>
                                masterDrive.files.create({
                                    requestBody: {
                                        name,
                                        parents: [targetId],
                                        mimeType: FOLDER,
                                    },
                                    fields: 'id',
                                })
                            );
                            newId = res.data.id!;
                        }
                        recordMapping(c.id!, newId);
                    } catch (err: any) {
                        console.error(`${indent}  ✗ create: ${err.message}`);
                        stat.errors++;
                        continue;
                    }
                }
                // w archiwum: cudze oryginały w środku ZOSTAJĄ (pojadą z folderem)
                await walk(
                    c.id!,
                    newId,
                    [...path, name],
                    archiveRoot ? true : inArchived,
                    indent + '  '
                );
                if (!inArchived) {
                    if (archiveRoot) {
                        console.log(
                            `${indent}[ARCHIWUM] oryginał folderu "${name}" → /${path.join('/') || '(root)'}`
                        );
                        if (apply)
                            await moveToArchive(c.id!, folderId, path, name, indent);
                    } else if (unlink && apply) {
                        await unlinkOriginal(c.id!, folderId, name, indent);
                    }
                }
            } else {
                console.log(
                    `${indent}[COPY] "${name}"  (${owner}; bez tokenu)`
                );
                stat.copied++;
                if (apply) {
                    try {
                        const res = await withRetry(() =>
                            masterDrive.files.copy({
                                fileId: c.id!,
                                requestBody: { name, parents: [targetId] },
                                fields: 'id',
                            })
                        );
                        recordMapping(c.id!, res.data.id!);
                    } catch (err: any) {
                        console.error(
                            `${indent}  ✗ copy: ${err.message} ${reason(err)}`
                        );
                        stat.errors++;
                        continue;
                    }
                }
                if (!inArchived) {
                    if (archiveRoot) {
                        console.log(
                            `${indent}[ARCHIWUM] oryginał "${name}" → /${path.join('/') || '(root)'}`
                        );
                        if (apply)
                            await moveToArchive(c.id!, folderId, path, name, indent);
                    } else if (unlink && apply) {
                        await unlinkOriginal(c.id!, folderId, name, indent);
                    }
                }
            }
        }
    }

    // root: jeśli cudzy a mamy token — też przejmij
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
                console.error(`  ✗ transfer roota: ${err.message}`);
                stat.errors++;
            }
        } else stat.transferred++;
    }
    await walk(rootId, rootId, [], false, '');

    // konsolidacja mapy: .jsonl (przyrostowy, odporny na awarię) → .json
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
        // .jsonl jest źródłem prawdy — zawiera też pary z przerwanych przebiegów
        if (existsSync(MAP_LOG)) {
            for (const line of readFileSync(MAP_LOG, 'utf8').split('\n')) {
                if (!line.trim()) continue;
                try {
                    const { old, new: nw } = JSON.parse(line);
                    if (old && nw) merged[old] = nw;
                } catch {}
            }
        }
        Object.assign(merged, idMap);
        writeFileSync(MAP_FILE, JSON.stringify(merged, null, 2), 'utf8');
        console.log(
            `\n[takeover] Mapa: ${MAP_LOG} (przyrostowo, ${Object.keys(idMap).length} par w tym przebiegu)` +
                `\n[takeover] Skonsolidowana: ${MAP_FILE} (${Object.keys(merged).length} par łącznie)`
        );
    }

    console.log('\n=== PODSUMOWANIE PRZEJĘCIA ===');
    console.log(`  Już własność mastera:      ${stat.alreadyOwn}`);
    console.log(`  TRANSFER własności:        ${stat.transferred}`);
    console.log(`  COPY (bez tokenu):         ${stat.copied}`);
    console.log(`  Foldery zastąpione:        ${stat.foldersReplaced}`);
    console.log(`  Zarchiwizowane oryginały:  ${stat.archived}`);
    console.log(`  Odpięte oryginały:         ${stat.unlinked}`);
    console.log(`  Błędy:                     ${stat.errors}`);
    if (!apply)
        console.log('\n[takeover] DRY-RUN — dodaj --apply, aby wykonać.');
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
    if (arg('takeover')) return takeoverMode(clients);
    return migrateMode(clients);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[gd-move-test] Błąd:', err.message || err);
        process.exit(1);
    });
