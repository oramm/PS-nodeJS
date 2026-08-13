/**
 * P0 — INSPEKCJA STRUKTURY ARKUSZY: zaliczki (petty cash) + rejestr listów (poczta).
 *
 * Skrypt jest w 100% READ-ONLY. Używa wyłącznie `spreadsheets.get`. Nie importuje
 * ToolsSheets (który zawiera metody zapisu), nie łączy się z bazą i nie wywołuje
 * żadnego `values.update`, `values.append`, `batchUpdate` ani `values.clear`.
 *
 * Cel: zamknąć prowizoryczne mapy kolumn w
 * `documentation/team/operations/petty-cash-sheets/plan.md` (sekcje 2.4 i 2.5):
 *   - tytuły zakładek i `sheetId`
 *   - liczba wierszy/kolumn, wiersze zamrożone
 *   - scalenia (`merges`) i zakresy chronione (`protectedRanges`)
 *   - formaty liczbowe kolumn
 *   - formuły w wierszach zbiorczych (m.in. "POZOSTAŁO W PORTFELU")
 *
 * Użycie:
 *   yarn pettycash:inspect                                   # inwentarz + podgląd 12 wierszy każdej zakładki
 *   yarn pettycash:inspect --pettyTab "2026" --rows 220      # głęboki zrzut wskazanej zakładki zaliczek
 *   yarn pettycash:inspect --postalTab "2026" --rows 220     # głęboki zrzut wskazanej zakładki rejestru
 *   yarn pettycash:inspect --petty <id> --postal <id>        # inne arkusze niż kopie deweloperskie
 *   yarn pettycash:inspect --out tmp/inny-plik.json
 *
 * Domyślnie czyta KOPIE deweloperskie, nigdy arkuszy produkcyjnych.
 * Wymaga `.env` z REFRESH_TOKEN i poświadczeniami Google.
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import { google, sheets_v4 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { oAuthClient } from '../setup/Sessions/ToolsGapi';
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';

/** Kopie deweloperskie udostępnione przez właściciela. Nie są to arkusze żywe. */
const DEV_COPIES = {
    pettyCash: '1ZF5aVskj4g7hcLGu_tDtIjbyoYBYl06HF3LtJf6ANLY',
    postalRegister: '12wijgpEnGa3cxSXYeEFzsDTc-wdp51xFlfNP5X4fmmk',
};

const SHALLOW_ROWS = 12;
const MAX_COLS = 60;

function parseArg(name: string, defaultValue?: string): string | undefined {
    const args = process.argv.slice(2);
    const index = args.findIndex((arg) => arg === `--${name}`);
    if (index === -1) return defaultValue;
    const next = args[index + 1];
    if (next === undefined || next.startsWith('--')) return 'true';
    return next;
}

async function getAuth(): Promise<OAuth2Client> {
    const refreshToken = process.env.REFRESH_TOKEN;
    if (!refreshToken) throw new Error('Brak REFRESH_TOKEN w .env');
    oAuthClient.setCredentials({ refresh_token: refreshToken });
    const tokens = await oAuthClient.getAccessToken();
    if (!tokens.token)
        throw new Error('Nie udało się pobrać access tokenu z Google');
    return oAuthClient;
}

function colLetter(index0: number): string {
    let n = index0 + 1;
    let out = '';
    while (n > 0) {
        n--;
        out = String.fromCharCode(65 + (n % 26)) + out;
        n = Math.floor(n / 26);
    }
    return out;
}

/** Cytowanie tytułu zakładki w notacji A1 (apostrofy podwajamy). */
function a1Range(title: string, rows: number, cols: number): string {
    const quoted = `'${title.replace(/'/g, "''")}'`;
    return `${quoted}!A1:${colLetter(cols - 1)}${rows}`;
}

type TabInfo = {
    title: string;
    sheetId: number;
    index: number;
    rowCount: number;
    columnCount: number;
    frozenRowCount: number;
    frozenColumnCount: number;
    hidden: boolean;
    mergeCount: number;
    merges: string[];
    protectedRanges: string[];
};

type PeekCell = {
    c: string;
    v?: string;
    formula?: string;
    numberFormat?: string;
};

type PeekRow = { r: number; cells: PeekCell[] };

function describeRange(r?: sheets_v4.Schema$GridRange | null): string {
    if (!r) return '(brak zakresu)';
    const c1 = colLetter(r.startColumnIndex ?? 0);
    const c2 = colLetter((r.endColumnIndex ?? 1) - 1);
    const r1 = (r.startRowIndex ?? 0) + 1;
    const r2 = r.endRowIndex ?? 1;
    return `${c1}${r1}:${c2}${r2}`;
}

async function fetchInventory(
    sheets: sheets_v4.Sheets,
    spreadsheetId: string,
): Promise<{ title: string; tabs: TabInfo[] }> {
    const res = await sheets.spreadsheets.get({
        spreadsheetId,
        includeGridData: false,
        fields: 'properties(title),sheets(properties(sheetId,title,index,hidden,gridProperties),merges,protectedRanges(range,description,warningOnly,editors))',
    });

    const tabs: TabInfo[] = (res.data.sheets ?? []).map((s) => {
        const p = s.properties ?? {};
        const g = p.gridProperties ?? {};
        const merges = s.merges ?? [];
        return {
            title: p.title ?? '(bez nazwy)',
            sheetId: p.sheetId ?? -1,
            index: p.index ?? -1,
            rowCount: g.rowCount ?? 0,
            columnCount: g.columnCount ?? 0,
            frozenRowCount: g.frozenRowCount ?? 0,
            frozenColumnCount: g.frozenColumnCount ?? 0,
            hidden: Boolean(p.hidden),
            mergeCount: merges.length,
            merges: merges.slice(0, 40).map(describeRange),
            protectedRanges: (s.protectedRanges ?? []).map(
                (pr) =>
                    `${describeRange(pr.range)}${
                        pr.warningOnly ? ' (tylko ostrzeżenie)' : ' (twarda)'
                    }${pr.description ? ` — ${pr.description}` : ''}`,
            ),
        };
    });

    return { title: res.data.properties?.title ?? '(bez tytułu)', tabs };
}

async function fetchPeek(
    sheets: sheets_v4.Sheets,
    spreadsheetId: string,
    tab: TabInfo,
    rows: number,
): Promise<PeekRow[]> {
    const cols = Math.min(tab.columnCount || MAX_COLS, MAX_COLS);
    const rowLimit = Math.min(rows, tab.rowCount || rows);
    if (cols < 1 || rowLimit < 1) return [];

    const res = await sheets.spreadsheets.get({
        spreadsheetId,
        includeGridData: true,
        ranges: [a1Range(tab.title, rowLimit, cols)],
        fields: 'sheets(data(rowData(values(formattedValue,userEnteredValue,effectiveFormat(numberFormat(type,pattern))))))',
    });

    const rowData = res.data.sheets?.[0]?.data?.[0]?.rowData ?? [];

    return rowData.map((row, rowIdx) => {
        const cells: PeekCell[] = [];
        (row.values ?? []).forEach((cell, colIdx) => {
            const formula = cell.userEnteredValue?.formulaValue ?? undefined;
            const value = cell.formattedValue ?? undefined;
            const nf = cell.effectiveFormat?.numberFormat;
            if (!formula && !value && !nf?.pattern) return;
            cells.push({
                c: colLetter(colIdx),
                ...(value ? { v: value } : {}),
                ...(formula ? { formula } : {}),
                ...(nf?.pattern
                    ? { numberFormat: `${nf.type ?? ''} ${nf.pattern}`.trim() }
                    : {}),
            });
        });
        return { r: rowIdx + 1, cells };
    });
}

function printInventory(label: string, title: string, tabs: TabInfo[]): void {
    console.log(`\n=== ${label} — "${title}" ===`);
    console.log(
        'idx | sheetId     | wierszy | kolumn | zamroż. | scaleń | chronione | tytuł',
    );
    for (const t of tabs) {
        console.log(
            `${String(t.index).padStart(3)} | ` +
                `${String(t.sheetId).padStart(11)} | ` +
                `${String(t.rowCount).padStart(7)} | ` +
                `${String(t.columnCount).padStart(6)} | ` +
                `${String(t.frozenRowCount).padStart(7)} | ` +
                `${String(t.mergeCount).padStart(6)} | ` +
                `${String(t.protectedRanges.length).padStart(9)} | ` +
                `${t.title}${t.hidden ? '  [ukryta]' : ''}`,
        );
        for (const pr of t.protectedRanges) console.log(`      chroniony: ${pr}`);
    }
}

async function main(): Promise<void> {
    const pettyId = parseArg('petty', DEV_COPIES.pettyCash) as string;
    const postalId = parseArg('postal', DEV_COPIES.postalRegister) as string;
    const pettyTab = parseArg('pettyTab');
    const postalTab = parseArg('postalTab');
    const deepRows = Number(parseArg('rows', '220'));
    const outPath = parseArg('out', 'tmp/pettycash-sheet-structure.json') as string;

    if (pettyId !== DEV_COPIES.pettyCash || postalId !== DEV_COPIES.postalRegister)
        console.warn(
            '\n⚠ Czytasz arkusz spoza kopii deweloperskich. Skrypt jest read-only, ale sprawdź, czy to zamierzone.',
        );

    const auth = await getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    const targets = [
        { key: 'pettyCash', label: 'ZALICZKI', id: pettyId, deepTab: pettyTab },
        {
            key: 'postalRegister',
            label: 'REJESTR LISTÓW',
            id: postalId,
            deepTab: postalTab,
        },
    ] as const;

    const dump: Record<string, unknown> = {
        generatedAt: new Date().toISOString(),
        note: 'READ-ONLY dump. Zrodlo: spreadsheets.get. Zadnego zapisu nie wykonano.',
        spreadsheets: {},
    };

    for (const target of targets) {
        const { title, tabs } = await fetchInventory(sheets, target.id);
        printInventory(target.label, title, tabs);

        const peek: Record<string, PeekRow[]> = {};
        for (const tab of tabs) {
            const isDeep =
                target.deepTab !== undefined &&
                tab.title.toLowerCase().includes(target.deepTab.toLowerCase());
            const rows = isDeep ? deepRows : SHALLOW_ROWS;
            try {
                peek[tab.title] = await fetchPeek(sheets, target.id, tab, rows);
                if (isDeep)
                    console.log(
                        `      → głęboki zrzut "${tab.title}": ${peek[tab.title].length} wierszy`,
                    );
            } catch (err: any) {
                console.warn(
                    `      ! nie udało się odczytać "${tab.title}": ${err?.message ?? err}`,
                );
                peek[tab.title] = [];
            }
        }

        (dump.spreadsheets as Record<string, unknown>)[target.key] = {
            spreadsheetId: target.id,
            title,
            tabs,
            peek,
        };
    }

    const resolved = path.resolve(process.cwd(), outPath);
    mkdirSync(path.dirname(resolved), { recursive: true });
    writeFileSync(resolved, JSON.stringify(dump, null, 2), 'utf-8');
    console.log(`\nZapisano: ${resolved}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
