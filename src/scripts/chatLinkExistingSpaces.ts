/**
 * CHT-5: podpina ISTNIEJACE pokoje Google Chat do kontraktow ENVI wg mapy zaakceptowanej przez wlasciciela.
 * Nie tworzy, nie kasuje i nie zmienia pokojow w Google, nie dodaje czlonkow. Zapisuje tylko ChatSpaces i Contracts.ChatSpaceId.
 *
 * Uzycie:
 *   npx ts-node src/scripts/chatLinkExistingSpaces.ts [--dry-run]   (domyslnie)
 *   npx ts-node src/scripts/chatLinkExistingSpaces.ts --apply
 *   npx ts-node src/scripts/chatLinkExistingSpaces.ts --undo
 * Zapis (--apply, --undo) odmawia pracy, gdy DB_HOST nie jest localhost/127.0.0.1, chyba ze podano --prod.
 * Lokalna baze daje NODE_ENV=development (.env.development); root .env wskazuje produkcje.
 */
import { loadEnv } from '../setup/loadEnv';
loadEnv();

import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import ToolsChat from '../setup/Sessions/ToolsChat';

/** displayName pokoju w Google -> OurId kontraktow (OurContractsData.OurId). */
const MAP: Array<{ displayName: string; ourIds: string[] }> = [
    { displayName: 'KOB.IK.01 - ks ATA', ourIds: ['KOB.IK.01'] },
    { displayName: 'KEP.IK.02', ourIds: ['KEP.IK.02'] },
    { displayName: 'MIE.IK.06 - ZUK ksx13', ourIds: ['MIE.IK.06'] },
    { displayName: 'KPC.IK.01 - Krapkowice', ourIds: ['KPC.IK.01'] },
    { displayName: 'MIE.IK.05 OŚ', ourIds: ['MIE.IK.05'] },
    { displayName: 'MIE.IK.02 SUW Źródła', ourIds: ['MIE.IK.02'] },
    { displayName: 'BOG.IK.01', ourIds: ['BOG.IK.01'] },
    { displayName: 'STR.INNE.05 masterplan GWS Strzelin', ourIds: ['STR.INNE.05'] },
    { displayName: 'WRZ.IK.02', ourIds: ['WRZ.IK.02'] },
    { displayName: 'SEC.IK.02 (FEDS)', ourIds: ['SEC.IK.02'] },
    { displayName: 'OZI.IK.03 ENE', ourIds: ['OZI.IK.03'] },
    { displayName: 'SEC.IK.01 (FENIKS)', ourIds: ['SEC.IK.01'] },
    { displayName: 'ZBS.IK.01', ourIds: ['ZBS.IK.01'] },
    {
        displayName: 'Ścinawa',
        ourIds: ['SCI.IK.02', 'SCI.IK.04', 'SCI.IK.05', 'SCI.IK.06', 'SCI.IK.07', 'SCI.IK.08'],
    },
    { displayName: 'CHC.GWS', ourIds: ['CHC.IK.02'] },
];

type Row = {
    googleName: string;
    displayName: string;
    uri: string | null;
    ourId: string;
    contractId: number | null;
    number: string | null;
    status: string | null;
    currentSpaceId: number | null;
};

const flag = (n: string) => process.argv.includes(`--${n}`);

function guardDb(write: boolean) {
    const host = (process.env.DB_HOST || '').trim().toLowerCase();
    const local = host === 'localhost' || host === '127.0.0.1';
    console.log(`[CHT-5] DB: ${host}/${process.env.DB_NAME} (${local ? 'lokalna' : 'ZDALNA'})`);
    if (write && !local && !flag('prod')) {
        throw new Error(
            `Odmowa zapisu: DB_HOST="${host}" nie jest lokalny. Uruchom z NODE_ENV=development albo podaj jawnie --prod.`
        );
    }
}

async function resolveSpaces(): Promise<Map<string, { name: string; uri: string | null }>> {
    const spaces = await ToolsChat.listSpaces();
    const out = new Map<string, { name: string; uri: string | null }>();
    for (const m of MAP) {
        const found = spaces.filter((s) => s.displayName === m.displayName);
        if (found.length !== 1) {
            throw new Error(
                `STOP: displayName "${m.displayName}" wystepuje ${found.length} razy w Google (oczekiwano 1).`
            );
        }
        out.set(m.displayName, { name: found[0].name!, uri: found[0].spaceUri ?? null });
    }
    console.log(`[CHT-5] pokoi w Google: ${spaces.length}, z mapy znaleziono: ${out.size}`);
    return out;
}

async function buildRows(resolved: Map<string, { name: string; uri: string | null }>): Promise<Row[]> {
    const rows: Row[] = [];
    for (const m of MAP) {
        const sp = resolved.get(m.displayName)!;
        for (const ourId of m.ourIds) {
            const r = (await ToolsDb.getQueryCallbackAsync(
                `SELECT c.Id, c.Number, c.Status, c.ChatSpaceId
                 FROM OurContractsData o JOIN Contracts c ON c.Id = o.Id
                 WHERE o.OurId = ?`,
                undefined,
                [ourId]
            )) as any[];
            if (r.length > 1) throw new Error(`STOP: OurId ${ourId} wskazuje ${r.length} kontraktow.`);
            rows.push({
                googleName: sp.name,
                displayName: m.displayName,
                uri: sp.uri,
                ourId,
                contractId: r[0]?.Id ?? null,
                number: r[0]?.Number ?? null,
                status: r[0]?.Status ?? null,
                currentSpaceId: r[0]?.ChatSpaceId ?? null,
            });
        }
    }
    return rows;
}

async function readState() {
    const ids = MAP.flatMap((m) => m.ourIds);
    const linked = (await ToolsDb.getQueryCallbackAsync(
        `SELECT o.OurId, c.Id AS ContractId, c.ChatSpaceId, s.DisplayName, s.GoogleName
         FROM OurContractsData o JOIN Contracts c ON c.Id = o.Id
         LEFT JOIN ChatSpaces s ON s.Id = c.ChatSpaceId
         WHERE o.OurId IN (?) ORDER BY o.OurId`,
        undefined,
        [ids]
    )) as any[];
    console.table(
        linked.map((r) => ({
            OurId: r.OurId,
            ContractId: r.ContractId,
            ChatSpaceId: r.ChatSpaceId,
            Pokoj: r.DisplayName,
        }))
    );
    const nLinked = linked.filter((r) => r.ChatSpaceId != null).length;
    const names = MAP.map((m) => m.displayName);
    const sp = (await ToolsDb.getQueryCallbackAsync(
        `SELECT COUNT(*) AS n FROM ChatSpaces WHERE DisplayName IN (?)`,
        undefined,
        [names]
    )) as any[];
    console.log(`[CHT-5] ODCZYT: podpietych kontraktow z mapy: ${nLinked}, wierszy ChatSpaces z mapy: ${sp[0].n}`);
}

async function main() {
    const apply = flag('apply');
    const undo = flag('undo');
    if (apply && undo) throw new Error('--apply i --undo wykluczaja sie.');
    guardDb(apply || undo);
    const resolved = await resolveSpaces();

    if (undo) {
        const names = [...resolved.values()].map((v) => v.name);
        const ids = MAP.flatMap((m) => m.ourIds);
        const res = await ToolsDb.transaction<{ cleared: number; deleted: number; kept: any[] }>(async (conn) => {
            const [c] = (await conn.query(
                `UPDATE Contracts c
                 JOIN OurContractsData o ON o.Id = c.Id
                 JOIN ChatSpaces s ON s.Id = c.ChatSpaceId
                 SET c.ChatSpaceId = NULL
                 WHERE o.OurId IN (?) AND s.GoogleName IN (?)`,
                [ids, names]
            )) as any;
            // Pokoj kasujemy tylko, gdy zaden kontrakt juz na niego nie wskazuje (takze spoza mapy).
            const [d] = (await conn.query(
                `DELETE FROM ChatSpaces
                 WHERE GoogleName IN (?)
                   AND NOT EXISTS (SELECT 1 FROM Contracts c WHERE c.ChatSpaceId = ChatSpaces.Id)`,
                [names]
            )) as any;
            const [kept] = (await conn.query(
                `SELECT s.Id, s.DisplayName, s.GoogleName, COUNT(c.Id) AS Contracts
                 FROM ChatSpaces s JOIN Contracts c ON c.ChatSpaceId = s.Id
                 WHERE s.GoogleName IN (?) GROUP BY s.Id`,
                [names]
            )) as any;
            return { cleared: c.affectedRows, deleted: d.affectedRows, kept };
        });
        console.log(`[CHT-5] UNDO: wyzerowano kontraktow ${res.cleared}, usunieto ChatSpaces ${res.deleted}`);
        if (res.kept.length) {
            console.log(`[CHT-5] UNDO: pokoi POZOSTAWIONYCH ${res.kept.length} (maja kontrakty spoza mapy):`);
            console.table(res.kept);
        }
        await readState();
        return;
    }

    const rows = await buildRows(resolved);
    const missing = rows.filter((r) => r.contractId == null);
    const conflicts: Row[] = [];
    for (const r of rows) {
        if (r.contractId == null || r.currentSpaceId == null) continue;
        const cur = (await ToolsDb.getQueryCallbackAsync(
            `SELECT GoogleName FROM ChatSpaces WHERE Id = ?`,
            undefined,
            [r.currentSpaceId]
        )) as any[];
        if (cur[0]?.GoogleName !== r.googleName) conflicts.push(r);
    }
    console.table(
        rows.map((r) => ({
            displayName: r.displayName,
            googleName: r.googleName,
            uri: r.uri,
            ourId: r.ourId,
            contractId: r.contractId,
            number: r.number,
            status: r.status,
            obecnyChatSpaceId: r.currentSpaceId,
        }))
    );
    console.log(
        `[CHT-5] wiersze planu: ${rows.length}, kontraktow nieznalezionych: ${missing.length} ${missing
            .map((r) => r.ourId)
            .join(',')}, konfliktow (inny pokoj): ${conflicts.length} ${conflicts.map((r) => r.ourId).join(',')}`
    );

    if (!apply) {
        console.log('[CHT-5] DRY-RUN: nic nie zapisano.');
        return;
    }
    if (missing.length || conflicts.length) {
        throw new Error('Odmowa --apply: sa kontrakty nieznalezione lub konflikty (patrz wyzej). Nic nie zapisano.');
    }

    const stats = await ToolsDb.transaction<{ inserted: number; updated: number }>(async (conn) => {
        let inserted = 0;
        let updated = 0;
        const spaceIds = new Map<string, number>();
        for (const m of MAP) {
            const sp = resolved.get(m.displayName)!;
            const ex = (await ToolsDb.getQueryCallbackAsync(
                `SELECT Id FROM ChatSpaces WHERE GoogleName = ?`,
                conn,
                [sp.name]
            )) as any[];
            if (ex[0]) {
                spaceIds.set(sp.name, ex[0].Id);
            } else {
                const [ins] = (await conn.query(
                    `INSERT INTO ChatSpaces (GoogleName, DisplayName, Uri, ProjectOurId, CreatedByPersonId)
                     VALUES (?, ?, ?, NULL, NULL)`,
                    [sp.name, m.displayName, sp.uri]
                )) as any;
                spaceIds.set(sp.name, ins.insertId);
                inserted++;
            }
        }
        for (const r of rows) {
            const sid = spaceIds.get(r.googleName)!;
            const [u] = (await conn.query(
                `UPDATE Contracts SET ChatSpaceId = ? WHERE Id = ? AND (ChatSpaceId IS NULL OR ChatSpaceId = ?)`,
                [sid, r.contractId, sid]
            )) as any;
            updated += u.changedRows ?? 0;
        }
        return { inserted, updated };
    });
    console.log(`[CHT-5] APPLY: wstawiono ChatSpaces ${stats.inserted}, zmieniono kontraktow ${stats.updated}`);
    await readState();
}

main()
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((e) => {
        console.error('BLAD:', e instanceof Error ? e.message : e);
        process.exit(1);
    });
