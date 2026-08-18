/**
 * AUDYT WŁASNOŚCI plików/folderów Google Drive powiązanych z bazą danych.
 *
 * Cel: przed migracją na Dysk współdzielony (Shared Drive) potwierdzić, że
 * KAŻDY obiekt GD, do którego odwołuje się baza, jest własnością konta z
 * REFRESH_TOKEN. Obiekty należące do kogoś innego po przeniesieniu zamieniłyby
 * się w skrót i urwałyby link w bazie.
 *
 * Skrypt jest w 100% READ-ONLY: używa wyłącznie information_schema (odczyt) oraz
 * drive.files.get (odczyt). Nie ma tu żadnej metody zapisu/przenoszenia/usuwania.
 *
 * Działanie:
 *   1. Wykrywa dynamicznie WSZYSTKIE kolumny w bazie trzymające ID Google Drive
 *      (nazwa pasująca do wzorca `Gd...Id`, typ tekstowy) — nie trzeba znać tabel.
 *   2. Zbiera unikalne ID (z zapamiętaniem, z których kolumn pochodzą).
 *   3. Dla każdego ID pobiera metadane własności (ownedByMe / owners / driveId).
 *   4. Klasyfikuje i zapisuje CSV + podsumowanie. Raportuje "przeczytano X/Y",
 *      więc widać, czy audyt objął 100% rekordów.
 *
 * Użycie:
 *   yarn gd:audit-ownership
 *   yarn gd:audit-ownership --sample 50          # najpierw próbka 50 ID
 *   yarn gd:audit-ownership --concurrency 6      # łagodniej dla API (domyślnie 8)
 *   yarn gd:audit-ownership --out raport.csv     # ścieżka CSV (domyślnie gd-audit-ownership.csv)
 *   yarn gd:audit-ownership --only-problems      # w konsoli pokaż tylko nie-OK
 *
 * Wymaga .env.development z REFRESH_TOKEN i poświadczeniami GD.
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import { google } from 'googleapis';
import ToolsGapi from '../setup/Sessions/ToolsGapi';
import ToolsDb from '../tools/ToolsDb';
import { writeFileSync } from 'fs';
import path from 'path';

function parseArg(name: string, defaultValue?: string): string | undefined {
    const args = process.argv.slice(2);
    const index = args.findIndex((arg) => arg === `--${name}`);
    if (index === -1) return defaultValue;
    // flagi bez wartości (np. --only-problems)
    const next = args[index + 1];
    if (next === undefined || next.startsWith('--')) return 'true';
    return next;
}

function hasFlag(name: string): boolean {
    return process.argv.slice(2).includes(`--${name}`);
}

type ColumnRef = { table: string; column: string };

type AuditStatus =
    | 'owned_by_token' // OK - własność konta z tokenem
    | 'owned_by_other' // UWAGA - własność kogoś innego
    | 'on_shared_drive' // już na Dysku współdzielonym (własność org)
    | 'shortcut' // to skrót, nie oryginał
    | 'unknown_owner' // brak ownedByMe i brak owners (nietypowe)
    | 'trashed' // w koszu
    | 'missing' // 404 - nie istnieje
    | 'no_access' // 403 - brak dostępu
    | 'error'; // inny błąd (np. po wyczerpaniu prób)

type AuditRow = {
    id: string;
    name: string;
    mimeType: string;
    status: AuditStatus;
    ownedByMe: string;
    ownerEmail: string;
    driveId: string;
    trashed: string;
    sources: string; // "Tabela.Kolumna; Tabela2.Kolumna2"
};


/** Wykrywa wszystkie kolumny tekstowe, których nazwa wygląda jak ID Google Drive. */
async function discoverGdIdColumns(): Promise<ColumnRef[]> {
    const sql = `
        SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND COLUMN_NAME REGEXP 'Gd.*Id$'
          AND DATA_TYPE IN ('varchar', 'char', 'text', 'tinytext', 'mediumtext')
        ORDER BY TABLE_NAME, COLUMN_NAME`;
    const rows = (await ToolsDb.getQueryCallbackAsync(sql)) as Array<{
        tableName: string;
        columnName: string;
    }>;
    return (rows ?? []).map((r) => ({
        table: r.tableName,
        column: r.columnName,
    }));
}

/** Wartości, które nie są prawdziwym ID GD i trzeba je pominąć. */
function isSkippableValue(v: unknown): boolean {
    if (typeof v !== 'string') return true;
    const s = v.trim();
    if (s === '' || s.toLowerCase() === 'root' || s.toLowerCase() === 'null')
        return true;
    // ID Google Drive są długie (>= ~20 znaków) i bez spacji
    if (s.length < 15 || /\s/.test(s)) return true;
    return false;
}

/** Zbiera unikalne ID z zapamiętaniem źródeł (Tabela.Kolumna). */
async function collectIds(
    columns: ColumnRef[]
): Promise<{ idToSources: Map<string, Set<string>>; skipped: number }> {
    const idToSources = new Map<string, Set<string>>();
    let skipped = 0;

    for (const { table, column } of columns) {
        // backticki chronią przed nazwami zależnymi od schematu; brak interpolacji użytkownika
        const sql = `SELECT DISTINCT \`${column}\` AS gdId
                     FROM \`${table}\`
                     WHERE \`${column}\` IS NOT NULL AND \`${column}\` <> ''`;
        let rows: Array<{ gdId: unknown }>;
        try {
            rows = (await ToolsDb.getQueryCallbackAsync(sql)) as Array<{
                gdId: unknown;
            }>;
        } catch (err: any) {
            console.warn(
                `[audit] Pominięto ${table}.${column}: ${err?.message ?? err}`
            );
            continue;
        }
        const source = `${table}.${column}`;
        for (const row of rows ?? []) {
            const value = row.gdId;
            if (isSkippableValue(value)) {
                skipped++;
                continue;
            }
            const id = (value as string).trim();
            if (!idToSources.has(id)) idToSources.set(id, new Set());
            idToSources.get(id)!.add(source);
        }
    }
    return { idToSources, skipped };
}

function getErrorReason(err: any): string {
    return (
        err?.response?.data?.error?.errors?.[0]?.reason ??
        err?.errors?.[0]?.reason ??
        ''
    );
}

function isRetryable(err: any): boolean {
    const code = err?.response?.status ?? err?.code;
    const reason = getErrorReason(err);
    if (code === 429 || code === 500 || code === 503) return true;
    if (code === 403 && /rateLimit|userRateLimit/i.test(reason)) return true;
    return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getFileWithRetry(
    drive: ReturnType<typeof google.drive>,
    id: string,
    maxRetries = 6
): Promise<AuditRow> {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            const res = await drive.files.get({
                fileId: id,
                fields: 'id, name, mimeType, ownedByMe, owners(emailAddress,displayName), driveId, trashed, shortcutDetails',
                supportsAllDrives: true,
            });
            const d = res.data;
            const ownerEmail = d.owners?.[0]?.emailAddress ?? '';
            let status: AuditStatus;
            if (d.mimeType === 'application/vnd.google-apps.shortcut')
                status = 'shortcut';
            else if (d.trashed) status = 'trashed';
            else if (d.driveId) status = 'on_shared_drive';
            else if (d.ownedByMe === true) status = 'owned_by_token';
            else if (d.ownedByMe === false && (d.owners?.length ?? 0) > 0)
                status = 'owned_by_other';
            else status = 'unknown_owner';

            return {
                id,
                name: d.name ?? '',
                mimeType: d.mimeType ?? '',
                status,
                ownedByMe: String(d.ownedByMe ?? ''),
                ownerEmail,
                driveId: d.driveId ?? '',
                trashed: String(d.trashed ?? ''),
                sources: '',
            };
        } catch (err: any) {
            const code = err?.response?.status ?? err?.code;
            if (isRetryable(err) && attempt < maxRetries) {
                const backoff =
                    Math.min(2 ** attempt * 500, 16000) +
                    Math.floor(Math.random() * 400);
                attempt++;
                await sleep(backoff);
                continue;
            }
            let status: AuditStatus;
            if (code === 404) status = 'missing';
            else if (code === 403) status = 'no_access';
            else status = 'error';
            return {
                id,
                name: err?.message ? `[${status}] ${err.message}` : '',
                mimeType: '',
                status,
                ownedByMe: '',
                ownerEmail: '',
                driveId: '',
                trashed: '',
                sources: '',
            };
        }
    }
}

async function runWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let index = 0;
    async function worker() {
        while (index < items.length) {
            const i = index++;
            results[i] = await fn(items[i], i);
        }
    }
    await Promise.all(
        Array.from({ length: Math.min(concurrency, items.length) }, worker)
    );
    return results;
}

function csvCell(v: string): string {
    const s = v ?? '';
    if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function toCsv(rows: AuditRow[]): string {
    const header = [
        'id',
        'name',
        'mimeType',
        'status',
        'ownedByMe',
        'ownerEmail',
        'driveId',
        'trashed',
        'sources',
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
        lines.push(
            [
                r.id,
                r.name,
                r.mimeType,
                r.status,
                r.ownedByMe,
                r.ownerEmail,
                r.driveId,
                r.trashed,
                r.sources,
            ]
                .map(csvCell)
                .join(',')
        );
    }
    return lines.join('\n');
}

async function main() {
    const concurrency = Math.max(1, Number(parseArg('concurrency', '8')) || 8);
    const sampleArg = parseArg('sample');
    const sample = sampleArg ? Math.max(1, Number(sampleArg) || 0) : 0;
    const outPath = path.resolve(parseArg('out', 'gd-audit-ownership.csv')!);
    const onlyProblems = hasFlag('only-problems');

    console.log('[audit] Wykrywanie kolumn z ID Google Drive w bazie...');
    const columns = await discoverGdIdColumns();
    if (columns.length === 0) {
        console.error(
            '[audit] Nie znaleziono żadnych kolumn pasujących do wzorca `Gd...Id`. Sprawdź połączenie z bazą.'
        );
        return;
    }
    console.log(
        `[audit] Znaleziono ${columns.length} kolumn:\n` +
            columns.map((c) => `        - ${c.table}.${c.column}`).join('\n')
    );

    console.log('[audit] Zbieranie unikalnych ID z bazy...');
    const { idToSources, skipped } = await collectIds(columns);
    let ids = Array.from(idToSources.keys());
    console.log(
        `[audit] Unikalnych ID: ${ids.length} (pominięto nie-ID/roots: ${skipped})`
    );

    if (sample && sample < ids.length) {
        ids = ids.slice(0, sample);
        console.log(`[audit] Tryb próbki: ograniczono do ${ids.length} ID`);
    }

    console.log('[audit] Autoryzacja Google Drive...');
    const auth = await ToolsGapi.getBackgroundAuth();
    const drive = google.drive({ version: 'v3', auth });

    console.log(
        `[audit] Odczyt metadanych z GD (concurrency=${concurrency})...`
    );
    let done = 0;
    const rows = await runWithConcurrency(ids, concurrency, async (id) => {
        const row = await getFileWithRetry(drive, id);
        row.sources = Array.from(idToSources.get(id) ?? []).join('; ');
        done++;
        if (done % 25 === 0 || done === ids.length) {
            process.stdout.write(`\r[audit] przeczytano ${done}/${ids.length}`);
        }
        return row;
    });
    console.log();

    const by = (s: AuditStatus) => rows.filter((r) => r.status === s);
    const ownedByToken = by('owned_by_token');
    const ownedByOther = by('owned_by_other');
    const onSharedDrive = by('on_shared_drive');
    const shortcut = by('shortcut');
    const unknownOwner = by('unknown_owner');
    const trashed = by('trashed');
    const missing = by('missing');
    const noAccess = by('no_access');
    const errored = by('error');

    const readErrors = missing.length + noAccess.length + errored.length;
    const readOk = rows.length - readErrors;

    // CSV: pełny albo tylko problemy
    const csvRows = onlyProblems
        ? rows.filter((r) => r.status !== 'owned_by_token')
        : rows;
    writeFileSync(outPath, toCsv(csvRows), 'utf8');

    console.log('\n=== PODSUMOWANIE AUDYTU ===');
    console.log(`  Unikalnych ID z bazy:        ${rows.length}`);
    console.log(`  Odczytano poprawnie:         ${readOk}/${rows.length}`);
    console.log('  ---');
    console.log(`  ✅ owned_by_token (konto z tokenem): ${ownedByToken.length}`);
    console.log(`  ⚠️  owned_by_other (KTOŚ INNY):       ${ownedByOther.length}`);
    console.log(`  ℹ️  on_shared_drive (już na Shared):  ${onSharedDrive.length}`);
    console.log(`  ⚠️  shortcut (to skrót):              ${shortcut.length}`);
    console.log(`  ⚠️  unknown_owner:                    ${unknownOwner.length}`);
    console.log(`  🗑️  trashed (w koszu):                ${trashed.length}`);
    console.log('  ---');
    console.log(`  ❌ missing (404):                     ${missing.length}`);
    console.log(`  ❌ no_access (403):                   ${noAccess.length}`);
    console.log(`  ❌ error (inny):                      ${errored.length}`);

    if (ownedByOther.length > 0) {
        console.log(
            '\n--- ⚠️  ID NIENALEŻĄCE do konta z tokenem (te urwałyby link po migracji) ---'
        );
        for (const r of ownedByOther.slice(0, 50)) {
            console.log(
                `  ${r.id}  owner=${r.ownerEmail}  "${r.name}"  [${r.sources}]`
            );
        }
        if (ownedByOther.length > 50)
            console.log(`  ...oraz ${ownedByOther.length - 50} więcej (patrz CSV)`);
    }

    if (readErrors > 0) {
        console.log(
            `\n[audit] UWAGA: ${readErrors} ID nie udało się w pełni odczytać ` +
                `(missing/no_access/error). Wynik NIE jest kompletny w 100% — sprawdź CSV.`
        );
    }

    const verdict =
        ownedByOther.length === 0 &&
        shortcut.length === 0 &&
        unknownOwner.length === 0 &&
        readErrors === 0;
    console.log(
        `\n[audit] WERDYKT: ${
            verdict
                ? '✅ Wszystkie ID z bazy należą do konta z tokenem — migracja przez MOVE bezpieczna.'
                : '⚠️ Są wyjątki — przejrzyj CSV przed migracją.'
        }`
    );
    console.log(`[audit] CSV zapisano: ${outPath}`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[audit] Błąd:', err);
        process.exit(1);
    });
