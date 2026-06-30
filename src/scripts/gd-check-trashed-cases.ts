/**
 * Sprawdza, które sprawy z DB mają folder na GD przeniesiony do kosza.
 *
 * Użycie:
 *   yarn gd:check-trashed
 *   yarn gd:check-trashed --projectId tes.d.c.l
 *   yarn gd:check-trashed --contractId 123
 *   yarn gd:check-trashed --milestoneId 45
 *   yarn gd:check-trashed --projectId tes.d.c.l --out raport.json
 *   yarn gd:check-trashed --concurrency 10
 *
 * Wymaga .env.development z REFRESH_TOKEN i poświadczeniami GD.
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { oAuthClient } from '../setup/Sessions/ToolsGapi';
import ToolsDb from '../tools/ToolsDb';
import { writeFileSync } from 'fs';
import path from 'path';

function parseArg(name: string, defaultValue?: string): string | undefined {
    const args = process.argv.slice(2);
    const index = args.findIndex((arg) => arg === `--${name}`);
    if (index === -1) return defaultValue;
    return args[index + 1] || defaultValue;
}

type CaseRow = { Id: number; GdFolderId: string; Name: string | null };

type CheckResult =
    | { status: 'trashed'; id: number; name: string | null; gdFolderId: string }
    | { status: 'missing'; id: number; name: string | null; gdFolderId: string }
    | { status: 'no_access'; id: number; name: string | null; gdFolderId: string }
    | { status: 'ok'; id: number; name: string | null; gdFolderId: string };

async function getAuth(): Promise<OAuth2Client> {
    const refreshToken = process.env.REFRESH_TOKEN;
    if (!refreshToken) throw new Error('Brak REFRESH_TOKEN w .env');
    oAuthClient.setCredentials({ refresh_token: refreshToken });
    const tokens = await oAuthClient.getAccessToken();
    if (!tokens.token) throw new Error('Nie udało się pobrać access tokenu z Google');
    return oAuthClient;
}

type DbFilters = {
    contractId?: number;
    projectId?: string;
    milestoneId?: number;
};

async function getCasesFromDb(filters: DbFilters = {}): Promise<CaseRow[]> {
    const conditions: string[] = [
        'Cases.GdFolderId IS NOT NULL',
        "Cases.GdFolderId != ''",
    ];
    const params: (string | number)[] = [];

    if (filters.contractId) {
        conditions.push('Milestones.ContractId = ?');
        params.push(filters.contractId);
    }
    if (filters.projectId) {
        conditions.push('Contracts.ProjectOurId = ?');
        params.push(filters.projectId);
    }
    if (filters.milestoneId) {
        conditions.push('Cases.MilestoneId = ?');
        params.push(filters.milestoneId);
    }

    const needsJoin = filters.contractId || filters.projectId || filters.milestoneId;

    const sql = needsJoin
        ? `SELECT Cases.Id, Cases.GdFolderId, Cases.Name
           FROM Cases
           JOIN Milestones ON Milestones.Id = Cases.MilestoneId
           ${filters.projectId ? 'LEFT JOIN Contracts ON Contracts.Id = Milestones.ContractId' : ''}
           WHERE ${conditions.join(' AND ')}
           ORDER BY Cases.Id`
        : `SELECT Id, GdFolderId, Name
           FROM Cases
           WHERE ${conditions.join(' AND ')}
           ORDER BY Id`;

    const rows = (await ToolsDb.getQueryCallbackAsync(sql, undefined, params)) as CaseRow[];
    return rows ?? [];
}

async function checkFolder(
    drive: ReturnType<typeof google.drive>,
    row: CaseRow
): Promise<CheckResult> {
    try {
        const res = await drive.files.get({
            fileId: row.GdFolderId,
            fields: 'id, trashed',
        });
        if (res.data.trashed) {
            return { status: 'trashed', id: row.Id, name: row.Name, gdFolderId: row.GdFolderId };
        }
        return { status: 'ok', id: row.Id, name: row.Name, gdFolderId: row.GdFolderId };
    } catch (err: any) {
        const code = err?.response?.status ?? err?.code;
        if (code === 404) {
            return { status: 'missing', id: row.Id, name: row.Name, gdFolderId: row.GdFolderId };
        }
        if (code === 403) {
            return { status: 'no_access', id: row.Id, name: row.Name, gdFolderId: row.GdFolderId };
        }
        throw err;
    }
}

async function runWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = [];
    let index = 0;

    async function worker() {
        while (index < items.length) {
            const i = index++;
            results[i] = await fn(items[i]);
        }
    }

    await Promise.all(Array.from({ length: concurrency }, worker));
    return results;
}

async function main() {
    const outArg = parseArg('out');
    const concurrency = Math.max(1, Number(parseArg('concurrency', '20')) || 20);

    const filters: DbFilters = {};
    const contractIdArg = parseArg('contractId');
    const projectIdArg = parseArg('projectId');
    const milestoneIdArg = parseArg('milestoneId');
    if (contractIdArg) filters.contractId = Number(contractIdArg);
    if (projectIdArg) filters.projectId = projectIdArg;
    if (milestoneIdArg) filters.milestoneId = Number(milestoneIdArg);

    if (Object.keys(filters).length > 0) {
        console.log('[gd-check] Filtry:', filters);
    }

    console.log('[gd-check] Autoryzacja GD...');
    const auth = await getAuth();
    const drive = google.drive({ version: 'v3', auth });

    console.log('[gd-check] Pobieranie spraw z DB...');
    const cases = await getCasesFromDb(filters);
    console.log(`[gd-check] Znaleziono ${cases.length} spraw z GdFolderId`);

    console.log(`[gd-check] Sprawdzanie folderów GD (concurrency=${concurrency})...`);
    let done = 0;
    const results = await runWithConcurrency(cases, concurrency, async (row) => {
        const result = await checkFolder(drive, row);
        done++;
        if (done % 20 === 0 || done === cases.length) {
            process.stdout.write(`\r[gd-check] ${done}/${cases.length}`);
        }
        return result;
    });
    console.log();

    const trashed = results.filter((r) => r.status === 'trashed');
    const missing = results.filter((r) => r.status === 'missing');
    const noAccess = results.filter((r) => r.status === 'no_access');
    const ok = results.filter((r) => r.status === 'ok');

    const report = {
        generatedAt: new Date().toISOString(),
        summary: {
            total: cases.length,
            ok: ok.length,
            trashed: trashed.length,
            missing: missing.length,
            no_access: noAccess.length,
        },
        trashed,
        missing,
        no_access: noAccess,
    };

    console.log('\n=== WYNIKI ===');
    console.log(`  OK:          ${ok.length}`);
    console.log(`  Kosz:        ${trashed.length}`);
    console.log(`  Nie istnieje: ${missing.length}`);
    console.log(`  Brak dostępu: ${noAccess.length}`);

    if (trashed.length > 0) {
        console.log('\n--- Foldery w KOSZU ---');
        for (const r of trashed) {
            console.log(`  Case ID=${r.id}  Nazwa="${r.name}"  GdId=${r.gdFolderId}`);
        }
    }

    if (outArg) {
        const outPath = path.resolve(outArg);
        writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
        console.log(`\n[gd-check] Raport zapisano: ${outPath}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[gd-check] Błąd:', err);
        process.exit(1);
    });
