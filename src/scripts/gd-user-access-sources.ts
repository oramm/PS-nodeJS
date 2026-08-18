/**
 * DOMKNIĘCIE RAPORTU gd-user-access.
 *
 * Foldery sklasyfikowane jako `dziedziczone` mają źródło uprawnienia
 * (`permissionDetails.inheritedFrom`). Jeśli to źródło nie znalazło się na
 * liście punktów cięcia, mamy lukę — dostęp, którego raport nie pokazał.
 * Ten skrypt rozwija każde takie źródło i sprawdza, czy jest już na liście.
 *
 * W 100% READ-ONLY (permissions.list + files.get).
 *
 * Użycie:
 *   yarn ts-node src/scripts/gd-user-access-sources.ts --email X --csv gd-out/plik.csv
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import { google, drive_v3 } from 'googleapis';
import { oAuthClient } from '../setup/Sessions/ToolsGapi';
import { readFileSync } from 'fs';

function parseArg(name: string, def?: string): string | undefined {
    const a = process.argv.slice(2);
    const i = a.findIndex((x) => x === `--${name}`);
    if (i === -1) return def;
    const n = a[i + 1];
    return n === undefined || n.startsWith('--') ? 'true' : n;
}

function parseCsv(text: string): string[][] {
    const rows: string[][] = [];
    let cur: string[] = [], f = '', q = false;
    const t = text.replace(/^﻿/, '');
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (q) {
            if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; }
            else f += c;
        } else if (c === '"') q = true;
        else if (c === ',') { cur.push(f); f = ''; }
        else if (c === '\n') { cur.push(f); rows.push(cur); cur = []; f = ''; }
        else if (c !== '\r') f += c;
    }
    if (f || cur.length) { cur.push(f); rows.push(cur); }
    return rows;
}

async function main() {
    const email = (parseArg('email') ?? '').toLowerCase();
    const csv = parseArg('csv')!;
    if (!email || !csv) throw new Error('Wymagane: --email i --csv');

    oAuthClient.setCredentials({ refresh_token: process.env.REFRESH_TOKEN });
    await oAuthClient.getAccessToken();
    const drive = google.drive({ version: 'v3', auth: oAuthClient });

    const rows = parseCsv(readFileSync(csv, 'utf8'));
    const head = rows.shift()!;
    const cId = head.indexOf('id');
    const cKind = head.indexOf('klasyfikacja');
    const cPath = head.indexOf('sciezka');

    const known = new Set(rows.filter((r) => r.length > cId).map((r) => r[cId]));
    const inheritedRows = rows.filter((r) => r.length > cKind && r[cKind] === 'dziedziczone');
    console.log(`Sprawdzam ${inheritedRows.length} folderów dziedziczonych...\n`);

    /** Uprawnienie osoby na obiekcie, z cache. null = brak dostępu. */
    const permCache = new Map<string, Promise<{ role: string; inherited: boolean } | null>>();
    function permOf(id: string) {
        let p = permCache.get(id);
        if (p) return p;
        p = (async () => {
            try {
                const res = await drive.permissions.list({
                    fileId: id,
                    fields: 'permissions(emailAddress,role,permissionDetails(inherited,inheritedFrom))',
                    pageSize: 100,
                    supportsAllDrives: true,
                });
                const hit = (res.data.permissions ?? []).find(
                    (x) => (x.emailAddress ?? '').toLowerCase() === email
                );
                if (!hit) return null;
                return {
                    role: hit.role ?? '',
                    inherited: !!hit.permissionDetails?.[0]?.inherited,
                };
            } catch {
                return null;
            }
        })();
        permCache.set(id, p);
        return p;
    }

    const metaCache = new Map<string, Promise<{ name: string; parents: string[] }>>();
    function metaOf(id: string) {
        let p = metaCache.get(id);
        if (p) return p;
        p = (async () => {
            try {
                const m = await drive.files.get({
                    fileId: id,
                    fields: 'name,parents',
                    supportsAllDrives: true,
                });
                return { name: m.data.name ?? id, parents: m.data.parents ?? [] };
            } catch {
                return { name: `<niedostępny ${id}>`, parents: [] };
            }
        })();
        metaCache.set(id, p);
        return p;
    }

    const sources = new Map<string, { count: number; example: string }>();
    let n = 0;
    for (const r of inheritedRows) {
        // Wspinaczka po rodzicach: najwyższy przodek, na którym osoba wciąż ma
        // dostęp, jest faktycznym punktem cięcia dla tej gałęzi.
        let cur = r[cId];
        const seen = new Set<string>([cur]);
        let guard = 0;
        while (guard++ < 30) {
            const meta = await metaOf(cur);
            const parent = meta.parents[0];
            if (!parent || seen.has(parent)) break;
            const pp = await permOf(parent);
            if (!pp) break; // rodzic już nie daje dostępu — cur jest szczytem
            seen.add(parent);
            cur = parent;
        }
        const e = sources.get(cur) ?? { count: 0, example: r[cPath] };
        e.count++;
        sources.set(cur, e);
        if (++n % 10 === 0) console.log(`  ...${n}/${inheritedRows.length}`);
    }

    console.log('=== ŹRÓDŁA DZIEDZICZENIA ===');
    for (const [src, info] of sources) {
        let name = src;
        try {
            const m = await drive.files.get({
                fileId: src,
                fields: 'name',
                supportsAllDrives: true,
            });
            name = m.data.name ?? src;
        } catch { name = `<niedostępny ${src}>`; }
        const flag = known.has(src) ? 'JUŻ NA LIŚCIE' : '*** LUKA — BRAK W RAPORCIE ***';
        console.log(`  ${flag}\n    źródło: ${name}  id=${src}\n    dotyczy ${info.count} folderów, np. ${info.example}\n`);
    }
    if (!sources.size) console.log('  (brak — żaden nie zwrócił inheritedFrom)');
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
