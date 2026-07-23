/**
 * Jednorazowy backfill: uzupełnia CaseTypeFolders dla istniejących (starych) par
 * (MilestoneId, CaseTypeId), dla których ID folderu GD nigdy nie zostało zapisane
 * w DB (zapisywanie na bieżąco dla nowych folderów robi CasesController.persistCaseTypeFolder).
 *
 * Dla każdej brakującej pary bierze dowolną sprawę tego typu w tym kamieniu milowym
 * z ustawionym GdFolderId i odczytuje z Drive API jej folder nadrzędny (=folder typu sprawy).
 *
 * Użycie:
 *   yarn backfill:case-type-folders            (dry-run, tylko raport)
 *   yarn backfill:case-type-folders:apply       (zapisuje do DB)
 */

import { loadEnv } from '../setup/loadEnv';
loadEnv();

import { OAuth2Client } from 'google-auth-library';
import { oAuthClient } from '../setup/Sessions/ToolsGapi';
import ToolsDb from '../tools/ToolsDb';
import ToolsGd from '../tools/ToolsGd';
import CaseTypeFolderRepository from '../contracts/milestones/cases/caseTypes/CaseTypeFolderRepository';

const APPLY = process.argv.includes('--apply');

type MissingPair = {
    milestoneId: number;
    caseTypeId: number;
    sampleGdFolderId: string;
};

async function getAuth(): Promise<OAuth2Client> {
    const refreshToken = process.env.REFRESH_TOKEN;
    if (!refreshToken) throw new Error('Brak REFRESH_TOKEN w .env');
    oAuthClient.setCredentials({ refresh_token: refreshToken });
    const tokens = await oAuthClient.getAccessToken();
    if (!tokens.token) throw new Error('Nie udało się pobrać access tokenu z Google');
    return oAuthClient;
}

async function getMissingPairs(): Promise<MissingPair[]> {
    const rows = (await ToolsDb.getQueryCallbackAsync(
        `SELECT Cases.MilestoneId, Cases.TypeId AS CaseTypeId, MIN(Cases.GdFolderId) AS SampleGdFolderId
         FROM Cases
         JOIN CaseTypes ON CaseTypes.Id = Cases.TypeId
         LEFT JOIN CaseTypeFolders
             ON CaseTypeFolders.MilestoneId = Cases.MilestoneId
             AND CaseTypeFolders.CaseTypeId = Cases.TypeId
         WHERE CaseTypes.IsUniquePerMilestone = 0
             AND Cases.GdFolderId IS NOT NULL
             AND Cases.GdFolderId != ''
             AND CaseTypeFolders.GdFolderId IS NULL
         GROUP BY Cases.MilestoneId, Cases.TypeId`
    )) as any[];

    return rows.map((row) => ({
        milestoneId: row.MilestoneId,
        caseTypeId: row.CaseTypeId,
        sampleGdFolderId: row.SampleGdFolderId,
    }));
}

async function main() {
    console.log(`[backfill] Tryb: ${APPLY ? 'APPLY (zapis do DB)' : 'DRY-RUN (bez zapisu)'}`);

    const pairs = await getMissingPairs();
    console.log(`[backfill] Brakujących par (MilestoneId, CaseTypeId): ${pairs.length}`);
    if (pairs.length === 0) return;

    console.log('[backfill] Autoryzacja GD...');
    const auth = await getAuth();

    const repository = new CaseTypeFolderRepository();
    let resolved = 0;
    let skipped = 0;

    for (const pair of pairs) {
        try {
            const metadata = await ToolsGd.getFileOrFolderMetaDataById(
                auth,
                pair.sampleGdFolderId
            );
            const folderId = metadata.parents?.[0];
            if (!folderId) {
                console.warn(
                    `[backfill] Brak parenta dla MilestoneId=${pair.milestoneId} CaseTypeId=${pair.caseTypeId}, pomijam`
                );
                skipped++;
                continue;
            }
            console.log(
                `[backfill] MilestoneId=${pair.milestoneId} CaseTypeId=${pair.caseTypeId} -> GdFolderId=${folderId}`
            );
            if (APPLY) {
                await repository.upsert(pair.milestoneId, pair.caseTypeId, folderId);
            }
            resolved++;
        } catch (error) {
            console.warn(
                `[backfill] Błąd dla MilestoneId=${pair.milestoneId} CaseTypeId=${pair.caseTypeId}:`,
                error
            );
            skipped++;
        }
    }

    console.log(`[backfill] Rozwiązano: ${resolved}, pominięto: ${skipped}`);
    if (!APPLY) console.log('[backfill] Dry-run - nic nie zapisano. Uruchom z --apply, aby zapisać.');
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[backfill] Błąd:', err);
        process.exit(1);
    });
