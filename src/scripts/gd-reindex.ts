/**
 * REINDEX bazy po migracji Google Drive.
 *
 * Podmienia w bazie stare ID obiektów GD na nowe, wg mapy `oldId -> newId`
 * wygenerowanej przez `gd-move-test --takeover` (gd-takeover-map.json).
 * Mapa zawiera tylko obiekty, które FAKTYCZNIE zmieniły ID:
 *   - kopie plików właścicieli bez tokenu,
 *   - foldery zastępcze właścicieli bez tokenu.
 * Obiekty przejęte transferem i własne mastera zachowują ID → nie ma ich w mapie.
 *
 * BEZPIECZEŃSTWO:
 *   - `--dry-run` DOMYŚLNIE: tylko liczy trafienia, nie zmienia niczego.
 *   - BLOKADA HOSTA: odmawia pracy na bazie innej niż localhost,
 *     dopóki nie podasz jawnie `--allow-remote`.
 *   - Wszystkie UPDATE w JEDNEJ transakcji (albo wszystko, albo nic).
 *   - `--rollback` cofa zmiany (mapa odwrotna newId -> oldId).
 *   - Weryfikacja po wykonaniu: ile starych ID pozostało (oczekiwane 0).
 *   - Idempotentny: ponowne uruchomienie nie robi nic (0 trafień).
 *
 * UŻYCIE:
 *   yarn gd:reindex                          # dry-run na lokalnej bazie
 *   yarn gd:reindex --apply                  # wykonanie
 *   yarn gd:reindex --rollback --apply       # cofnięcie
 *   yarn gd:reindex --map inna-mapa.json
 *   yarn gd:reindex --apply --allow-remote   # ŚWIADOMIE na zdalnej bazie
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import ToolsDb from '../tools/ToolsDb';
import mysql from 'mysql2/promise';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
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

/** Katalog na raporty — wspólny z gd-backup i gd-move-test. */
function outPath(name: string): string {
    if (path.isAbsolute(name) || name.includes('/') || name.includes('\\'))
        return name;
    const dir = arg('outdir', 'gd-out')!;
    mkdirSync(dir, { recursive: true });
    return path.join(dir, name);
}

type ColumnRef = { table: string; column: string };

/** Wykrywa wszystkie kolumny tekstowe wyglądające jak ID Google Drive. */
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

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

/** Zwraca stare ID faktycznie występujące w danej kolumnie. */
async function findMatches(
    conn: mysql.PoolConnection | undefined,
    col: ColumnRef,
    ids: string[]
): Promise<string[]> {
    const found: string[] = [];
    for (const part of chunk(ids, 500)) {
        const placeholders = part.map(() => '?').join(',');
        const sql = `SELECT DISTINCT \`${col.column}\` AS v
                     FROM \`${col.table}\`
                     WHERE \`${col.column}\` IN (${placeholders})`;
        const rows = (await ToolsDb.getQueryCallbackAsync(
            sql,
            conn,
            part
        )) as Array<{ v: string }>;
        for (const r of rows ?? []) if (r.v) found.push(r.v);
    }
    return found;
}

/**
 * Generuje SYNTETYCZNĄ mapę do próby generalnej: bierze N prawdziwych ID
 * z bazy i mapuje je na sztuczne "TESTNEW_...". Pozwala przećwiczyć cały
 * reindex (apply + weryfikacja + rollback) BEZ dotykania Google Drive.
 */
async function makeTestMap(n: number, outPath: string) {
    const columns = await discoverGdIdColumns();
    const map: Record<string, string> = {};
    for (const col of columns) {
        if (Object.keys(map).length >= n) break;
        const rows = (await ToolsDb.getQueryCallbackAsync(
            `SELECT DISTINCT \`${col.column}\` AS v FROM \`${col.table}\`
             WHERE \`${col.column}\` IS NOT NULL AND \`${col.column}\` <> ''
             LIMIT ${Math.max(1, n)}`
        )) as Array<{ v: string }>;
        for (const r of rows ?? []) {
            if (Object.keys(map).length >= n) break;
            if (r.v && r.v.length > 15 && !map[r.v])
                map[r.v] = 'TESTNEW_' + r.v;
        }
    }
    writeFileSync(outPath, JSON.stringify(map, null, 2), 'utf8');
    console.log(
        `[reindex] Mapa testowa (${Object.keys(map).length} par) zapisana: ${outPath}\n` +
            `   Próba generalna:\n` +
            `     yarn gd:reindex --map ${outPath}\n` +
            `     yarn gd:reindex --map ${outPath} --apply\n` +
            `     yarn gd:reindex --map ${outPath} --rollback --apply`
    );
}

/** Wczytuje mapę z .json (obiekt) albo .jsonl (przyrostowy log). */
function loadMapFile(mapPath: string): Record<string, string> {
    const rawText = readFileSync(mapPath, 'utf8');
    const raw: Record<string, string> = {};
    if (mapPath.endsWith('.jsonl')) {
        for (const line of rawText.split('\n')) {
            if (!line.trim()) continue;
            try {
                const { old, new: nw } = JSON.parse(line);
                if (old && nw) raw[old] = nw;
            } catch {}
        }
    } else Object.assign(raw, JSON.parse(rawText));
    return raw;
}

/**
 * PRÓBA GENERALNA: wpisuje do TESTOWEJ bazy stare ID z mapy, żeby reindex
 * miał co podmieniać. Dzięki temu można przećwiczyć pełny cykl
 * takeover → reindex na prawdziwych ID z folderu testowego na Drive.
 *
 * DESTRUKCYJNE dla wskazanej tabeli — używać WYŁĄCZNIE na kopii bazy.
 */
async function seedFromMap(mapPath: string, tableArg: string | undefined, apply: boolean) {
    const map = loadMapFile(mapPath);
    const oldIds = Object.keys(map);
    if (!oldIds.length) throw new Error('Mapa jest pusta.');

    const columns = await discoverGdIdColumns();
    let target: ColumnRef | undefined;
    if (tableArg && tableArg !== 'true') {
        const [t, c] = tableArg.split('.');
        target = columns.find(
            (x) =>
                x.table.toLowerCase() === (t || '').toLowerCase() &&
                x.column.toLowerCase() === (c || '').toLowerCase()
        );
        if (!target)
            throw new Error(
                `Nie znaleziono kolumny ${tableArg}. Dostępne np.: ${columns
                    .slice(0, 5)
                    .map((x) => x.table + '.' + x.column)
                    .join(', ')}`
            );
    } else {
        target =
            columns.find(
                (x) =>
                    x.table.toLowerCase() === 'cases' &&
                    x.column.toLowerCase() === 'gdfolderid'
            ) ?? columns[0];
    }

    // klucz główny tabeli (do celowania w konkretne wiersze)
    const pkRows = (await ToolsDb.getQueryCallbackAsync(
        `SELECT COLUMN_NAME AS pk FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_KEY = 'PRI'
         LIMIT 1`,
        undefined,
        [target.table]
    )) as Array<{ pk: string }>;
    const pk = pkRows?.[0]?.pk;
    if (!pk)
        throw new Error(`Tabela ${target.table} nie ma klucza głównego.`);

    const rows = (await ToolsDb.getQueryCallbackAsync(
        `SELECT \`${pk}\` AS id FROM \`${target.table}\` ORDER BY \`${pk}\` LIMIT ${oldIds.length}`
    )) as Array<{ id: any }>;
    if (!rows?.length)
        throw new Error(`Tabela ${target.table} jest pusta — nie ma co zasiać.`);

    const n = Math.min(rows.length, oldIds.length);
    console.log(
        `[seed] ${apply ? 'ZASIEWAM' : 'DRY-RUN — zasiałbym'} ${n} wierszy: ` +
            `${target.table}.${target.column} ← stare ID z ${mapPath}`
    );
    if (!apply) {
        console.warn(
            `\n[seed] ⚠ To NADPISZE ${target.table}.${target.column} w ${n} wierszach —\n` +
                `   uruchamiaj WYŁĄCZNIE na kopii bazy, nigdy na dev z realnymi danymi.\n` +
                `   Dodaj --apply, aby wykonać.`
        );
        return;
    }
    await ToolsDb.transaction(async (conn) => {
        for (let i = 0; i < n; i++) {
            await conn.query(
                `UPDATE \`${target!.table}\` SET \`${target!.column}\` = ? WHERE \`${pk}\` = ?`,
                [oldIds[i], rows[i].id]
            );
        }
    });
    console.log(
        `[seed] Gotowe. Teraz:\n` +
            `   yarn gd:reindex --map ${mapPath}            # powinno pokazać ${n} trafień\n` +
            `   yarn gd:reindex --map ${mapPath} --apply    # podmiana na nowe ID\n` +
            `   (weryfikacja: nowe ID otwórz w Drive — to obiekty z przeniesionego drzewa)`
    );
}

async function main() {
    const mapPath = arg('map', 'gd-takeover-map.json')!;
    const apply = flag('apply');
    const rollback = flag('rollback');
    const allowRemote = flag('allow-remote');
    const makeTest = arg('make-test-map');
    const seed = flag('seed');

    // ---------- BLOKADA HOSTA ----------
    const host = (process.env.DB_HOST || '').trim();
    const dbName = process.env.DB_NAME;
    const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(host);
    console.log(`[reindex] Baza: ${host}/${dbName}`);
    if (!isLocal && !allowRemote) {
        console.error(
            `\n[reindex] ⛔ ODMOWA: host "${host}" nie jest lokalny.\n` +
                `   To zabezpieczenie przed przypadkowym uruchomieniem na produkcji.\n` +
                `   Jeśli świadomie chcesz to zrobić, dodaj --allow-remote.`
        );
        process.exit(1);
    }
    if (!isLocal) console.warn('[reindex] ⚠ PRACA NA ZDALNEJ BAZIE (--allow-remote)');

    if (makeTest && makeTest !== 'true')
        return makeTestMap(Number(makeTest) || 10, 'gd-testmap.json');

    if (seed) {
        if (!isLocal)
            throw new Error('--seed działa wyłącznie na lokalnej bazie.');
        if (!existsSync(mapPath))
            throw new Error(`Brak pliku mapy: ${mapPath}`);
        return seedFromMap(mapPath, arg('seed-table'), apply);
    }

    // ---------- MAPA ----------
    if (!existsSync(mapPath))
        throw new Error(
            `Brak pliku mapy: ${mapPath}. Wygeneruj go przez gd:move-test --takeover --apply.`
        );
    // obsługa obu formatów: skonsolidowany .json oraz przyrostowy .jsonl
    // (.jsonl jest odporny na awarię przebiegu — używaj go, gdy takeover padł)
    const raw = loadMapFile(mapPath);
    let pairs = Object.entries(raw);
    if (rollback) pairs = pairs.map(([o, n]) => [n, o]);
    const mapping = new Map(pairs);
    const sourceIds = [...mapping.keys()];
    console.log(
        `[reindex] Mapa: ${mapPath} (${sourceIds.length} par)${
            rollback ? ' — TRYB ROLLBACK (odwrotna)' : ''
        }`
    );

    // ---------- KOLUMNY ----------
    const columns = await discoverGdIdColumns();
    if (!columns.length) throw new Error('Nie znaleziono kolumn Gd*Id.');
    console.log(`[reindex] Kolumn z ID GD: ${columns.length}`);

    // ---------- SKAN TRAFIEŃ ----------
    console.log(`\n[reindex] ${apply ? 'APPLY' : 'DRY-RUN'} — szukam trafień...\n`);
    const hits: Array<{ col: ColumnRef; ids: string[] }> = [];
    let totalHits = 0;
    for (const col of columns) {
        const found = await findMatches(undefined, col, sourceIds);
        if (found.length) {
            hits.push({ col, ids: found });
            totalHits += found.length;
            console.log(
                `  ${(col.table + '.' + col.column).padEnd(50)} ${found.length}`
            );
        }
    }
    if (!totalHits) {
        console.log(
            '  (brak trafień — baza nie zawiera żadnego ID z mapy;\n' +
                '   to normalne, jeśli reindex już wykonano albo migrowano dane spoza bazy)'
        );
    }
    console.log(`\n[reindex] Rekordów do zmiany: ${totalHits}`);

    if (!apply) {
        console.log('\n[reindex] DRY-RUN — dodaj --apply, aby wykonać.');
        return;
    }
    if (!totalHits) return;

    // ---------- WYKONANIE (jedna transakcja) ----------
    let updated = 0;
    await ToolsDb.transaction(async (conn) => {
        for (const { col, ids } of hits) {
            for (const part of chunk(ids, 500)) {
                const cases = part
                    .map(() => `WHEN ? THEN ?`)
                    .join(' ');
                const placeholders = part.map(() => '?').join(',');
                const params: string[] = [];
                for (const old of part) params.push(old, mapping.get(old)!);
                params.push(...part);
                const sql = `UPDATE \`${col.table}\`
                             SET \`${col.column}\` = CASE \`${col.column}\` ${cases} END
                             WHERE \`${col.column}\` IN (${placeholders})`;
                const [res] = await conn.query(sql, params);
                updated += (res as mysql.ResultSetHeader).affectedRows ?? 0;
            }
        }
    });
    console.log(`[reindex] Zaktualizowano wierszy: ${updated}`);

    // ---------- WERYFIKACJA ----------
    let remaining = 0;
    for (const { col } of hits) {
        const still = await findMatches(undefined, col, sourceIds);
        remaining += still.length;
        if (still.length)
            console.warn(
                `  ⚠ ${col.table}.${col.column}: pozostało ${still.length} starych ID`
            );
    }
    console.log(
        remaining === 0
            ? '[reindex] ✅ Weryfikacja OK — brak starych ID w bazie.'
            : `[reindex] ⚠ Pozostało ${remaining} starych ID — sprawdź powyższe.`
    );

    // Dziennik wykonania (dowód do post-change-checklist). Znacznik czasu w nazwie,
    // bo migracja idzie projekt po projekcie przez kilka dni — stała nazwa kasowałaby
    // ślad po poprzednich przebiegach.
    const at = new Date();
    const stamp = at.toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const logFile = outPath(
        `gd-reindex-log-${rollback ? 'rollback' : 'apply'}-${stamp}.json`
    );
    writeFileSync(
        logFile,
        JSON.stringify(
            {
                at: at.toISOString(),
                db: `${host}/${dbName}`,
                map: mapPath,
                rollback,
                pairs: sourceIds.length,
                rowsUpdated: updated,
                remaining,
                columns: hits.map((h) => ({
                    table: h.col.table,
                    column: h.col.column,
                    count: h.ids.length,
                })),
            },
            null,
            2
        ),
        'utf8'
    );
    console.log(`[reindex] Dziennik zapisany: ${logFile}`);
    console.log(
        rollback
            ? ''
            : '[reindex] Cofnięcie: yarn gd:reindex --rollback --apply'
    );
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[reindex] Błąd:', err.message || err);
        process.exit(1);
    });
