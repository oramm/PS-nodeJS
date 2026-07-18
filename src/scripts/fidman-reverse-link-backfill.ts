/**
 * DM-L1 — one-time backfill of Contracts.FidmanContractId (PS ENVI reverse link → FIDman).
 *
 * Usage:
 *   ts-node src/scripts/fidman-reverse-link-backfill.ts             # dry-run (default), writes nothing
 *   ts-node src/scripts/fidman-reverse-link-backfill.ts --apply     # fills FidmanContractId (no-clobber)
 *   ts-node src/scripts/fidman-reverse-link-backfill.ts --selfcheck # DB-free parser assertions
 *
 * Source of pairs: src/scripts/data/fidman-new-psids.csv — an export of the FIDman side
 * (fidman.contracts.id ↔ fidman.contracts.legacy_contract_id = PS.Contracts.Id), i.e. the
 * already-materialized pairing. Columns: id (FIDman contracts.id), number, legacy_contract_id (PS Id).
 * The `number` column may contain quoted commas, so we read the FIRST and LAST field only
 * (both are bare integers) instead of a full CSV parse.
 *
 * No-clobber: UPDATE ... WHERE FidmanContractId IS NULL — an already-linked contract is never
 * overwritten with a different id (matches the ack path in FidmanSync.deliverOutboxRow).
 *
 * Requires the 004_add_contracts_fidman_contract_id migration applied first. Prod (kylos) is
 * owner-gated — run dry-run, review, then --apply under an explicit NODE_ENV.
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import fs from 'fs';
import path from 'path';
import ToolsDb from '../tools/ToolsDb';

const CSV_PATH = path.join(__dirname, 'data', 'fidman-new-psids.csv');

export type LinkPair = { fidmanId: number; psId: number };

/** Extract {fidmanId, psId} from a CSV line using first/last field (bare ints); null if not a pair. */
export function parsePair(line: string): LinkPair | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    const firstComma = trimmed.indexOf(',');
    const lastComma = trimmed.lastIndexOf(',');
    if (firstComma === -1 || lastComma === firstComma) return null;
    const fidmanId = Number(trimmed.slice(0, firstComma).trim());
    const psId = Number(trimmed.slice(lastComma + 1).trim());
    if (!Number.isInteger(fidmanId) || !Number.isInteger(psId)) return null;
    return { fidmanId, psId };
}

export function loadPairs(csv: string): LinkPair[] {
    return csv
        .split(/\r?\n/)
        .slice(1) // drop header
        .map(parsePair)
        .filter((p): p is LinkPair => p !== null);
}

function hasFlag(name: string): boolean {
    return process.argv.slice(2).includes(`--${name}`);
}

/** DB-free assertions on the tricky quoted-comma rows — smallest guard on the parser. */
function selfCheck(): void {
    const cases: [string, LinkPair | null][] = [
        ['2,17,244', { fidmanId: 2, psId: 244 }],
        ['6,"K3, K4",410', { fidmanId: 6, psId: 410 }], // comma inside quoted number
        ['5,K6 Domanin ,419', { fidmanId: 5, psId: 419 }], // trailing space in number
        ['id,number,legacy_contract_id', null], // header-ish → NaN → null
        ['', null],
    ];
    for (const [line, expected] of cases) {
        const got = parsePair(line);
        const ok = JSON.stringify(got) === JSON.stringify(expected);
        if (!ok) throw new Error(`parsePair(${JSON.stringify(line)}) = ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
    }
    console.log('[ReverseLinkBackfill] selfcheck OK (parser)');
}

async function main() {
    if (hasFlag('selfcheck')) {
        selfCheck();
        return;
    }

    const apply = hasFlag('apply');
    const pairs = loadPairs(fs.readFileSync(CSV_PATH, 'utf8'));
    const psIds = pairs.map((p) => p.psId);

    // Current state for the pairs in scope (existence + already-linked detection).
    const placeholders = psIds.map(() => '?').join(',');
    const rows = (await ToolsDb.getQueryCallbackAsync(
        `SELECT Id, FidmanContractId FROM Contracts WHERE Id IN (${placeholders})`,
        undefined,
        psIds
    )) as { Id: number; FidmanContractId: number | null }[];
    const currentById = new Map(rows.map((r) => [r.Id, r.FidmanContractId]));

    const missing: number[] = []; // PS Id in CSV but not in Contracts
    const wouldSet: LinkPair[] = []; // FidmanContractId currently NULL
    const alreadySame: LinkPair[] = []; // already = same id (idempotent no-op)
    const conflict: (LinkPair & { existing: number })[] = []; // already = different id (no-clobber skips)

    for (const pair of pairs) {
        if (!currentById.has(pair.psId)) {
            missing.push(pair.psId);
            continue;
        }
        const existing = currentById.get(pair.psId) ?? null;
        if (existing === null) wouldSet.push(pair);
        else if (existing === pair.fidmanId) alreadySame.push(pair);
        else conflict.push({ ...pair, existing });
    }

    console.log(`[ReverseLinkBackfill] mode=${apply ? 'apply' : 'dry-run'} csv=${CSV_PATH}`);
    console.log(`[ReverseLinkBackfill] pairs in CSV (non-empty PS id): ${pairs.length}`);
    console.log(`[ReverseLinkBackfill] present in Contracts: ${pairs.length - missing.length}`);
    console.log(`[ReverseLinkBackfill]   - would set (FidmanContractId IS NULL): ${wouldSet.length}`);
    console.log(`[ReverseLinkBackfill]   - already same (idempotent): ${alreadySame.length}`);
    console.log(`[ReverseLinkBackfill]   - CONFLICT (already set to a DIFFERENT id — no-clobber SKIPS): ${conflict.length}${conflict.length ? ' ' + JSON.stringify(conflict) : ''}`);
    console.log(`[ReverseLinkBackfill]   - MISSING (PS Id not in Contracts): ${missing.length}${missing.length ? ' ids=[' + missing.join(', ') + ']' : ''}`);

    if (!apply) {
        console.log('[ReverseLinkBackfill] dry-run — nothing written.');
        return;
    }

    let affected = 0;
    for (const pair of wouldSet) {
        const res = await ToolsDb.executeSQL(
            `UPDATE Contracts SET FidmanContractId = ? WHERE Id = ? AND FidmanContractId IS NULL`,
            [pair.fidmanId, pair.psId]
        );
        affected += res.affectedRows ?? 0;
    }
    console.log(`[ReverseLinkBackfill] UPDATE affectedRows total: ${affected} (expected ${wouldSet.length})`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[ReverseLinkBackfill] error:', err);
        process.exit(1);
    });
