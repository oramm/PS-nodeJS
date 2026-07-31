/**
 * LIS-6 detektor 1 — odpowiedzi leżące w innej sprawie niż pismo źródłowe.
 *
 * Dla każdego pisma z wypełnionym `RelatedLetterNumber` odnajduje pismo źródłowe
 * (po `Letters.Number`) i sprawdza, czy oba pisma mają choć jedną wspólną sprawę
 * w `Letters_Cases`. Brak części wspólnej = rozjazd.
 *
 * Wyłącznie odczyt (SELECT). Zero zapisów, zero automatycznego scalania —
 * patrz `20_projects/Aplikacje/PS.APP.01/plans/2026-07-30-lis-rejestracja-pism-agent-plan.md`,
 * checkpoint LIS-6.
 *
 * Użycie:
 *   yarn lis6:detector1
 *   yarn lis6:detector1 -- --out raport-detektor1.json
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import ToolsDb from '../tools/ToolsDb';
import { writeFileSync } from 'fs';
import path from 'path';

function parseArg(name: string): string | undefined {
    const args = process.argv.slice(2);
    const index = args.findIndex((arg) => arg === `--${name}`);
    if (index === -1) return undefined;
    return args[index + 1];
}

interface DriftRow {
    RespId: number;
    RespNumber: string;
    RespDescription: string | null;
    RelNum: string;
    SrcId: number;
    SrcNumber: string;
    SrcDescription: string | null;
    RespCaseIds: string | null;
    SrcCaseIds: string | null;
}

const SQL = `
    SELECT
        resp.Id AS RespId,
        resp.Number AS RespNumber,
        resp.Description AS RespDescription,
        resp.RelatedLetterNumber AS RelNum,
        src.Id AS SrcId,
        src.Number AS SrcNumber,
        src.Description AS SrcDescription,
        (SELECT GROUP_CONCAT(rc.CaseId ORDER BY rc.CaseId) FROM Letters_Cases rc WHERE rc.LetterId = resp.Id) AS RespCaseIds,
        (SELECT GROUP_CONCAT(sc.CaseId ORDER BY sc.CaseId) FROM Letters_Cases sc WHERE sc.LetterId = src.Id) AS SrcCaseIds
    FROM Letters resp
    JOIN Letters src ON src.Number = resp.RelatedLetterNumber AND src.Id <> resp.Id
    WHERE resp.RelatedLetterNumber IS NOT NULL
      AND resp.RelatedLetterNumber != ''
      AND NOT EXISTS (
          SELECT 1
          FROM Letters_Cases rc
          JOIN Letters_Cases sc ON sc.CaseId = rc.CaseId
          WHERE rc.LetterId = resp.Id AND sc.LetterId = src.Id
      )
    ORDER BY resp.Id
`;

const TOTAL_WITH_RELATED_SQL = `
    SELECT COUNT(*) AS c FROM Letters
    WHERE RelatedLetterNumber IS NOT NULL AND RelatedLetterNumber != ''
`;

async function main() {
    const outArg = parseArg('out');

    const [totalRows] = (await ToolsDb.getQueryCallbackAsync(
        TOTAL_WITH_RELATED_SQL
    )) as any;
    const totalWithRelated = Number(totalRows.c);

    const rows = (await ToolsDb.getQueryCallbackAsync(SQL)) as DriftRow[];

    console.log('=== LIS-6 Detektor 1: odpowiedzi w innej sprawie niż pismo źródłowe ===');
    console.log(`Pism z RelatedLetterNumber wypełnionym: ${totalWithRelated}`);
    console.log(`Rozjazd (brak wspólnej sprawy z pismem źródłowym): ${rows.length}`);
    console.log('');

    for (const r of rows) {
        console.log(
            `#${r.RespId} (nr "${r.RespNumber}") sprawy=[${r.RespCaseIds ?? '-'}]  ` +
                `-> odpowiada na #${r.SrcId} (nr "${r.SrcNumber}") sprawy=[${r.SrcCaseIds ?? '-'}]`
        );
    }

    if (outArg) {
        const outPath = path.resolve(outArg);
        writeFileSync(
            outPath,
            JSON.stringify({ totalWithRelated, count: rows.length, rows }, null, 2),
            'utf8'
        );
        console.log(`\n[lis6-detector1] Raport zapisano: ${outPath}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[lis6-detector1] Błąd:', err);
        process.exit(1);
    });
