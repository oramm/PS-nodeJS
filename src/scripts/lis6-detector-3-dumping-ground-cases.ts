/**
 * LIS-6 detektor 3 — sygnał jakościowy: sprawa-wysypisko.
 *
 * Sprawy nazwane dokładnie "Koordynacja" albo "Sprawy bieżące" (patrz plan,
 * reguła 6 w "Regułach wyboru sprawy": to ostateczność dla spraw bez ciągu
 * dalszego) z dużą liczbą pism rozciągniętych na miesiące. Punkt odniesienia
 * z planu: sprawa 10508 ma 13 pism od 2025-09.
 *
 * To sygnał jakościowy, nie twardy dowód rozjazdu — sprawa może zasadnie
 * gromadzić rozproszone pisma. Raport tylko wskazuje kandydatów do przeglądu.
 *
 * Wyłącznie odczyt (SELECT). Zero zapisów, zero automatycznego scalania.
 *
 * Użycie:
 *   yarn lis6:detector3
 *   yarn lis6:detector3 -- --min-letters 8 --min-months 3 --out raport-detektor3.json
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import ToolsDb from '../tools/ToolsDb';
import { writeFileSync } from 'fs';
import path from 'path';

function parseArg(name: string, defaultValue?: string): string | undefined {
    const args = process.argv.slice(2);
    const index = args.findIndex((arg) => arg === `--${name}`);
    if (index === -1) return defaultValue;
    return args[index + 1] || defaultValue;
}

interface DumpingGroundRow {
    CaseId: number;
    CaseName: string;
    ContractId: number | null;
    LetterCount: number;
    FirstRegistration: string;
    LastRegistration: string;
    SpanMonths: number;
}

const SQL = `
    SELECT
        cs.Id AS CaseId,
        cs.Name AS CaseName,
        m.ContractId AS ContractId,
        COUNT(l.Id) AS LetterCount,
        DATE_FORMAT(MIN(l.RegistrationDate), '%Y-%m-%d') AS FirstRegistration,
        DATE_FORMAT(MAX(l.RegistrationDate), '%Y-%m-%d') AS LastRegistration,
        TIMESTAMPDIFF(MONTH, MIN(l.RegistrationDate), MAX(l.RegistrationDate)) AS SpanMonths
    FROM Cases cs
    JOIN Milestones m ON m.Id = cs.MilestoneId
    JOIN Letters_Cases lc ON lc.CaseId = cs.Id
    JOIN Letters l ON l.Id = lc.LetterId
    WHERE LOWER(TRIM(REPLACE(REPLACE(cs.Name, CHAR(10), ''), CHAR(13), ''))) IN ('koordynacja', 'sprawy biezace', 'sprawy bieżące')
    GROUP BY cs.Id, cs.Name, m.ContractId
    HAVING LetterCount > 0
    ORDER BY LetterCount DESC, cs.Id ASC
`;

async function main() {
    const minLetters = Number(parseArg('min-letters', '8'));
    const minMonths = Number(parseArg('min-months', '3'));
    const outArg = parseArg('out');

    const rows = (await ToolsDb.getQueryCallbackAsync(SQL)) as DumpingGroundRow[];

    const flagged = rows.filter(
        (r) => r.LetterCount >= minLetters && r.SpanMonths >= minMonths
    );

    console.log('=== LIS-6 Detektor 3: sprawy-wysypiska ("Koordynacja" / "Sprawy bieżące") ===');
    console.log(
        `Sprawy o tej nazwie z >=1 pismem: ${rows.length}. Próg: >=${minLetters} pism, >=${minMonths} mies. rozpiętości.`
    );
    console.log(`Wyflagowanych: ${flagged.length}`);
    console.log('');

    for (const r of flagged) {
        console.log(
            `#${r.CaseId} "${r.CaseName.trim()}" (kontrakt ${r.ContractId ?? '-'})  ` +
                `pism=${r.LetterCount}  ${r.FirstRegistration} .. ${r.LastRegistration}  ` +
                `(${r.SpanMonths} mies.)`
        );
    }

    const referenceCase = rows.find((r) => r.CaseId === 10508);
    console.log('');
    console.log(
        `Punkt odniesienia z planu (sprawa 10508): ${
            referenceCase
                ? `pism=${referenceCase.LetterCount}, ${referenceCase.FirstRegistration}..${referenceCase.LastRegistration}`
                : 'NIE ZNALEZIONA'
        }`
    );

    if (outArg) {
        const outPath = path.resolve(outArg);
        writeFileSync(
            outPath,
            JSON.stringify({ minLetters, minMonths, count: flagged.length, flagged, all: rows }, null, 2),
            'utf8'
        );
        console.log(`\n[lis6-detector3] Raport zapisano: ${outPath}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[lis6-detector3] Błąd:', err);
        process.exit(1);
    });
