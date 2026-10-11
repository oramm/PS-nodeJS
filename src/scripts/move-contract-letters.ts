/**
 * SPR-L, 2026-10: jednorazowe przepięcie pism PO przeniesieniu umowy inżyniera.
 * Lokalnie: yarn letters:move-contract --contractId=123 [--limit=5] [--no-drive-check]
 * Zapis: yarn letters:move-contract:apply --contractId=123 [--limit=5]
 * Produkcja, jak bezpośredni runner fidman-backfill (loadEnv ładuje .env.production):
 *   yarn cross-env NODE_ENV=production TS_NODE_FILES=true ts-node src/scripts/move-contract-letters.ts --contractId=123
 *   ta sama komenda z --apply wykonuje zapis; wpisy package.json używają development.
 */
import { loadEnv } from '../setup/loadEnv';
import { ContractScopeRow, LetterRow, driveItemId, executePlan, lettersSql, parseArgs, planLetters, validateScope } from './move-contract-letters-core';

export async function main(args = process.argv.slice(2)) {
    const options = parseArgs(args);
    loadEnv();
    // Import po loadEnv: Setup odczytuje konfigurację przy ładowaniu modułu.
    const { default: ToolsDb } = await import('../tools/ToolsDb');
    const { default: ToolsGapi } = await import('../setup/Sessions/ToolsGapi');
    const { google } = await import('googleapis');
    try {
        const roots = await ToolsDb.getQueryCallbackAsync(
            `SELECT c.Id AS id, c.Number AS number, c.Name AS name,
                    c.ProjectOurId AS projectOurId, o.OurId AS ourId
             FROM Contracts c JOIN OurContractsData o ON o.Id = c.Id
             JOIN ContractTypes t ON t.Id = c.TypeId
             WHERE c.Id = ? AND t.IsOur = 1`, undefined, [options.contractId]
        ) as Array<ContractScopeRow & { ourId: string }>;
        const root = roots[0];
        if (!root?.ourId) throw new Error('Nie znaleziono umowy inżyniera (ContractOur) z OurId.');
        const children = await ToolsDb.getQueryCallbackAsync(
            `SELECT Id AS id, Number AS number, Name AS name, ProjectOurId AS projectOurId
             FROM Contracts WHERE OurIdRelated = ? AND Id <> ? ORDER BY Id`,
            undefined, [root.ourId, root.id]
        ) as ContractScopeRow[];
        const contracts = [root, ...children];
        const projectOurId = validateScope(contracts, options.contractId);
        const projects = await ToolsDb.getQueryCallbackAsync(
            `SELECT Id AS id, OurId AS ourId, Name AS name, LettersGdFolderId AS lettersGdFolderId
             FROM Projects WHERE OurId = ?`, undefined, [projectOurId]
        ) as Array<{ id: number; ourId: string; name: string; lettersGdFolderId: string | null }>;
        if (projects.length !== 1) throw new Error(`Nie znaleziono jednoznacznego projektu ${projectOurId}.`);
        const project = projects[0];
        const contractIds = contracts.map((c) => c.id);
        const sql = lettersSql(contractIds.length);
        const rows = await ToolsDb.getQueryCallbackAsync(sql, undefined, contractIds) as LetterRow[];
        const plan = planLetters(rows, contractIds, project.id, options.limit);
        console.log(`SPR-L: ${options.apply ? 'WYKONANIE' : 'PODGLĄD (bez zapisów)'}`);
        console.log('Umowy w zakresie:');
        for (const c of contracts) console.log(`  Id=${c.id}, ${c.number || '(bez numeru)'} — ${c.name}`);
        console.log(`Projekt docelowy: ${project.ourId} — ${project.name} (Id=${project.id})`);
        console.log('Pisma bez sprawy nie są objęte; projekt źródłowy nie jest zgadywany.');
        console.log(`Kwalifikujące się: ${plan.qualifying.length}; wybrane przez limit: ${plan.selected.length}; już przepięte: ${plan.alreadyMoved.length}`);
        for (const [label, letters] of [['Pominięte (b) ofertowe', plan.offers], ['Pominięte (c) sprawy spoza zakresu lub nierozpoznane', plan.outsideScope]] as const) {
            console.log(`${label}: ${letters.length}`);
            for (const l of letters) console.log(`  Id=${l.id}, numer=${l.number ?? '(brak)'}, data=${l.creationDate instanceof Date ? l.creationDate.toISOString().slice(0, 10) : l.creationDate ?? '(brak)'}`);
        }
        const needsDrive = plan.selected.some((l) => driveItemId(l));
        if (needsDrive && !options.noDriveCheck && !project.lettersGdFolderId) {
            throw new Error('PYTANIE: brak Projects.LettersGdFolderId. Opcje: uzupełnić zweryfikowane ID Korespondencji w PS albo uzgodnić wyszukiwanie folderu po nazwie. Przerwano przed zapisami.');
        }
        if (options.noDriveCheck) console.log('UWAGA: --no-drive-check — pominięto odczyt Dysku; położenie i liczby przenosin niezweryfikowane.');
        const auth = needsDrive && !options.noDriveCheck ? await ToolsGapi.getBackgroundAuth() : undefined;
        const drive = auth ? google.drive({ version: 'v3', auth }) : undefined;
        const targetFolderId = project.lettersGdFolderId!;
        const result = await executePlan(plan, project.id, options.apply, {
            targetFolderId,
            getMetadata: async (id) => (await drive!.files.get({
                fileId: id, fields: 'id, name, parents, trashed', supportsAllDrives: true,
            })).data,
            moveOnDrive: async (id, sourceFolderId) => {
                await drive!.files.update({
                    fileId: id, removeParents: sourceFolderId, addParents: targetFolderId, supportsAllDrives: true,
                });
            },
            updateLetterProject: async (id, projectId, previousProjectId) => {
                const update = await ToolsDb.getQueryCallbackAsync(
                    'UPDATE Letters SET ProjectId = ? WHERE Id = ? AND ProjectId = ?', undefined, [projectId, id, previousProjectId]
                ) as { affectedRows: number };
                return update.affectedRows;
            },
        }, options.noDriveCheck);
        const describe = (l: LetterRow) => `Id=${l.id}, numer=${l.number ?? '(brak)'}, data=${l.creationDate instanceof Date ? l.creationDate.toISOString().slice(0, 10) : l.creationDate ?? '(brak)'}`;
        for (const [label, letters] of [
            ['Do przeniesienia (IN_SOURCE)', result.inSource],
            ['Tylko baza — już w miejscu docelowym (IN_TARGET)', result.inTarget],
            ['Tylko baza — bez identyfikatora Dysku', result.withoutDriveId],
            ['Bez sprawdzenia Dysku', result.unchecked],
        ] as const) {
            console.log(`${label}: ${letters.length}`);
            for (const l of letters) console.log(`  ${describe(l)}`);
        }
        console.log(`Pominięte (d) plik poza Korespondencją projektu źródłowego: ${result.elsewhere.length}`);
        for (const { letter, reason } of result.elsewhere) console.log(`  ${describe(letter)}: ${reason}`);
        console.log(`Błędy: ${result.errors.length}`);
        for (const error of result.errors) console.log(`  Id=${error.id}: ${error.message}`);
        console.log(`Podsumowanie${options.apply ? '' : ' (podgląd)'}: kwalifikujące się=${plan.qualifying.length} / przeniesione (Dysk+baza)=${result.moved} / tylko baza=${result.databaseOnly} / pominięte (b)=${plan.offers.length} (c)=${plan.outsideScope.length} (d)=${result.elsewhere.length} / błędy=${result.errors.length}${options.noDriveCheck ? ` / bez sprawdzenia Dysku=${result.unchecked.length}` : ''}`);
        if (result.errors.length) process.exitCode = 1;
    } finally {
        await ToolsDb.pool.end();
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`SPR-L: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    });
}
