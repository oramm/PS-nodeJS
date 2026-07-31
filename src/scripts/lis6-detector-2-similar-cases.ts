/**
 * LIS-6 detektor 2 — ten sam przedmiot opisany w dwóch różnych sprawach tego
 * samego kontraktu, wykrywany przez zbieżność opisów pism (`Letters.Description`)
 * i tytułów ustaleń ze spotkań (`MeetingArrangements.Name` po `CaseId`).
 *
 * Wyłapuje pary, których detektor 1 (LIS-6 detektor 1, po `RelatedLetterNumber`)
 * nie widzi, bo powiązanie `relatedLetterNumber` nie zostało wypełnione — sprawa
 * powstała drugi raz z innego modułu (np. z agendy spotkania), zamiast zostać
 * dopisana do istniejącej.
 *
 * Miara podobieństwa: `./lis6-textSimilarity.ts` — normalizacja + prymitywne
 * stemowanie + overlap coefficient (|A∩B| / min(|A|,|B|)) na zbiorach słów
 * znaczących, bez bibliotek zewnętrznych i bez LLM. Overlap coefficient,
 * nie Jaccard: sprawy w tym korpusie mają skrajnie nierówną ilość tekstu
 * (jedna kilka pism, druga jeden tytuł ustalenia), a Jaccard karze tę
 * asymetrię dużym mianownikiem (sumą zbiorów) — patrz uzasadnienie przy
 * `overlapCoefficient`.
 *
 * Wyłącznie odczyt (SELECT). Zero zapisów, zero automatycznego scalania.
 *
 * Użycie:
 *   yarn lis6:detector2
 *   yarn lis6:detector2 -- --threshold 0.7 --out raport-detektor2.json
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import ToolsDb from '../tools/ToolsDb';
import { writeFileSync } from 'fs';
import path from 'path';
import { wordBag, overlapCoefficient } from './lis6-textSimilarity';

function parseArg(name: string, defaultValue?: string): string | undefined {
    const args = process.argv.slice(2);
    const index = args.findIndex((arg) => arg === `--${name}`);
    if (index === -1) return defaultValue;
    return args[index + 1] || defaultValue;
}

interface CaseTextRow {
    CaseId: number;
    CaseName: string | null;
    ContractId: number;
    LetterDescs: string | null;
    MANames: string | null;
}

const SQL = `
    SELECT
        cs.Id AS CaseId,
        cs.Name AS CaseName,
        m.ContractId AS ContractId,
        (
            SELECT GROUP_CONCAT(DISTINCT l.Description SEPARATOR ' || ')
            FROM Letters_Cases lc
            JOIN Letters l ON l.Id = lc.LetterId
            WHERE lc.CaseId = cs.Id AND l.Description IS NOT NULL AND l.Description != ''
        ) AS LetterDescs,
        (
            SELECT GROUP_CONCAT(DISTINCT ma.Name SEPARATOR ' || ')
            FROM MeetingArrangements ma
            WHERE ma.CaseId = cs.Id
        ) AS MANames
    FROM Cases cs
    JOIN Milestones m ON m.Id = cs.MilestoneId
    WHERE m.ContractId IS NOT NULL
`;

interface Pair {
    contractId: number;
    a: CaseTextRow;
    b: CaseTextRow;
    score: number;
    intersection: string[];
}

/**
 * Kalibracja progów (LIS-6, sesja detektorów, 2026-07-31, odczyt na kylosie):
 *   - threshold=1.0 (overlap coefficient): para 13653/13709 ma pełne pokrycie
 *     mniejszego worka (score dokładnie 1.0) — niższy próg nie jest potrzebny
 *     do znalezienia pary testowej i tylko wpuszcza szum.
 *   - minShared=2: para testowa dzieli dokładnie 2 słowa ("stac", "przedmuchiwan")
 *     — to górna granica bez utraty pary; wyżej (3) para znika.
 *   - dfCutoff=0.02: słowo pospolite w >2% wszystkich niepustych worków w całej
 *     bazie (nie tylko w obrębie kontraktu) trafia na listę odrzuconych. Poniżej
 *     tego progu (0.01-0.015) odrzucane bywa samo "przedmuchiwan" lub "stac" —
 *     para testowa znika.
 *   - minRicherBagSize=12: bogatszy z dwóch worków (u pary testowej: 16 słów
 *     po odrzuceniu pospolitych) musi mieć realną treść, nie 2-3 przypadkowe
 *     słowa. Bez tego progu detektor zwracał 11528 par (threshold Jaccarda
 *     0.10) — przy overlap coefficient=1.0 bez tego filtra nadal 147 par.
 *     Z filtrem: 83 pary. Test pary 13653/13709 przechodzi z zapasem
 *     (16 >= 12), nie na granicy.
 * Wynik przy tych progach: patrz progress, sesja LIS-6 — trzy uruchomienia.
 */
async function main() {
    const threshold = Number(parseArg('threshold', '1.0'));
    const minShared = Number(parseArg('min-shared', '2'));
    const dfCutoff = Number(parseArg('df-cutoff', '0.02'));
    const minBagSize = Number(parseArg('min-bag-size', '2'));
    const minRicherBagSize = Number(parseArg('min-richer-bag-size', '12'));
    const outArg = parseArg('out');

    const rows = (await ToolsDb.getQueryCallbackAsync(SQL)) as CaseTextRow[];

    const withText = rows.filter((r) => r.LetterDescs || r.MANames);

    const bags = new Map<number, Set<string>>();
    for (const r of withText) {
        const text = [r.LetterDescs, r.MANames].filter(Boolean).join(' ');
        bags.set(r.CaseId, wordBag(text));
    }

    // Odrzucenie słów pospolitych po częstości w CAŁYM korpusie (document frequency),
    // nie tylko po sztywnej liście stopwords. Korespondencja budowlana ma własny żargon
    // administracyjny ("przekazanie", "akceptacja", "wykonawca", "odpowiedź"...), który
    // powtarza się w większości spraw niezależnie od przedmiotu — bez tego kroku Jaccard
    // na małych workach słów łapie tysiące przypadkowych par na jednym wspólnym słowie.
    const nonEmptyCount = [...bags.values()].filter((b) => b.size > 0).length;
    const df = new Map<string, number>();
    for (const bag of bags.values()) {
        for (const w of bag) df.set(w, (df.get(w) ?? 0) + 1);
    }
    const commonWords = new Set(
        [...df.entries()]
            .filter(([, count]) => count / nonEmptyCount > dfCutoff)
            .map(([w]) => w)
    );
    for (const [caseId, bag] of bags) {
        bags.set(
            caseId,
            new Set([...bag].filter((w) => !commonWords.has(w)))
        );
    }

    // grupowanie po kontrakcie — porównujemy wyłącznie sprawy tego samego kontraktu
    const byContract = new Map<number, CaseTextRow[]>();
    for (const r of withText) {
        // Worki mniejsze niż próg odrzucamy: przy 1-2 słowach Jaccard jest
        // niestabilny — jedno przypadkowe wspólne słowo daje wysoki wynik.
        if (bags.get(r.CaseId)!.size < minBagSize) continue;
        const list = byContract.get(r.ContractId) ?? [];
        list.push(r);
        byContract.set(r.ContractId, list);
    }

    const pairs: Pair[] = [];
    for (const [contractId, list] of byContract) {
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const a = list[i];
                const b = list[j];
                const bagA = bags.get(a.CaseId)!;
                const bagB = bags.get(b.CaseId)!;
                const { score, intersection } = overlapCoefficient(bagA, bagB);
                // Poza samym pokryciem wymagamy, żeby CHOĆ JEDNA strona miała realną
                // treść (nie dwa przypadkowo identyczne dwuwyrazowe worki) — inaczej
                // "pełne pokrycie" trafia się głównie na szumie dwóch ubogich opisów.
                const richerBagSize = Math.max(bagA.size, bagB.size);
                if (
                    score >= threshold &&
                    intersection.length >= minShared &&
                    richerBagSize >= minRicherBagSize
                ) {
                    pairs.push({ contractId, a, b, score, intersection });
                }
            }
        }
    }

    pairs.sort(
        (x, y) =>
            y.score - x.score ||
            x.contractId - y.contractId ||
            x.a.CaseId - y.a.CaseId ||
            x.b.CaseId - y.b.CaseId
    );

    console.log('=== LIS-6 Detektor 2: ten sam przedmiot w dwóch sprawach kontraktu ===');
    console.log(`Sprawy z treścią (pisma lub ustalenia spotkań): ${withText.length}`);
    console.log(
        `Próg podobieństwa (overlap coefficient): ${threshold}, min. wspólnych słów: ${minShared}, ` +
            `min. rozmiar worka: ${minBagSize}, min. rozmiar bogatszego worka: ${minRicherBagSize}, ` +
            `próg słów pospolitych (DF): ${dfCutoff} (odrzucono ${commonWords.size} słów)`
    );
    console.log(`Par powyżej progu: ${pairs.length}`);
    console.log('');

    for (const p of pairs) {
        console.log(
            `[kontrakt ${p.contractId}] score=${p.score.toFixed(3)} ` +
                `wspólne=[${p.intersection.join(', ')}]  ` +
                `#${p.a.CaseId} "${p.a.CaseName ?? ''}"  <->  #${p.b.CaseId} "${p.b.CaseName ?? ''}"`
        );
    }

    const testPairFound = pairs.some(
        (p) =>
            (p.a.CaseId === 13653 && p.b.CaseId === 13709) ||
            (p.a.CaseId === 13709 && p.b.CaseId === 13653)
    );
    console.log('');
    console.log(
        `Test poprawności (para 13653/13709): ${testPairFound ? 'ZNALEZIONA' : 'NIE ZNALEZIONA'}`
    );

    if (outArg) {
        const outPath = path.resolve(outArg);
        writeFileSync(
            outPath,
            JSON.stringify(
                { threshold, minShared, dfCutoff, count: pairs.length, testPairFound, pairs },
                null,
                2
            ),
            'utf8'
        );
        console.log(`\n[lis6-detector2] Raport zapisano: ${outPath}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[lis6-detector2] Błąd:', err);
        process.exit(1);
    });
