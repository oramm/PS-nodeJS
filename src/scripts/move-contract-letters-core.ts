export interface ContractScopeRow {
    id: number;
    number: string | null;
    name: string;
    projectOurId: string | null;
}

export interface LetterRow {
    id: number;
    number: string | null;
    creationDate: string | Date | null;
    projectId: number | null;
    offerId: number | null;
    sourceLettersFolderId: string | null;
    gdFolderId: string | null;
    gdDocumentId: string | null;
    caseId: number | null;
    contractId: number | null;
    caseOfferId: number | null;
}

export interface LetterPlan {
    qualifying: LetterRow[];
    selected: LetterRow[];
    alreadyMoved: LetterRow[];
    offers: LetterRow[];
    outsideScope: LetterRow[];
}

export function parseArgs(args: string[]) {
    let contractId: number | undefined;
    let limit: number | undefined;
    let apply = false;
    let noDriveCheck = false;
    const seen = new Set<string>();
    for (const arg of args) {
        const key = arg.split('=')[0];
        if (seen.has(key)) throw new Error(`Powtórzony argument: ${key}`);
        seen.add(key);
        if (arg === '--apply') apply = true;
        else if (arg === '--no-drive-check') noDriveCheck = true;
        else if (/^--(contractId|limit)=[1-9]\d*$/.test(arg)) {
            const value = Number(arg.split('=')[1]);
            if (!Number.isSafeInteger(value)) throw new Error(`Nieprawidłowy argument: ${arg}`);
            if (key === '--contractId') contractId = value;
            else limit = value;
        } else throw new Error(`Nieprawidłowy argument: ${arg}`);
    }
    if (!contractId) throw new Error('Podaj --contractId=<dodatnie Id umowy inżyniera>.');
    if (apply && noDriveCheck) throw new Error('--no-drive-check jest dozwolone wyłącznie w podglądzie.');
    return { contractId, limit, apply, noDriveCheck };
}

export function validateScope(contracts: ContractScopeRow[], contractId: number): string {
    const root = contracts.find((contract) => contract.id === contractId);
    if (!root?.projectOurId) throw new Error('Nie znaleziono umowy inżyniera lub jej projektu.');
    const mismatched = contracts.filter((contract) => contract.projectOurId !== root.projectOurId);
    if (mismatched.length) {
        throw new Error(`Przerwano: umowy podległe mają inny projekt: ${mismatched.map((c) => c.id).join(', ')}.`);
    }
    return root.projectOurId;
}

export function planLetters(rows: LetterRow[], contractIds: number[], targetProjectId: number, limit?: number): LetterPlan {
    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) throw new Error('Limit musi być dodatnią liczbą całkowitą.');
    const scope = new Set(contractIds);
    const grouped = new Map<number, LetterRow[]>();
    for (const row of rows) {
        const associations = grouped.get(row.id) || [];
        associations.push(row);
        grouped.set(row.id, associations);
    }
    const plan: LetterPlan = { qualifying: [], selected: [], alreadyMoved: [], offers: [], outsideScope: [] };
    for (const associations of grouped.values()) {
        // Zakres wejścia obejmuje wyłącznie pisma osiągalne przez sprawę umowy z zakresu.
        if (!associations.some((r) => r.caseId !== null && r.contractId !== null && scope.has(r.contractId))) continue;
        const letter = associations[0];
        if (letter.offerId !== null || associations.some((r) => r.caseOfferId !== null)) plan.offers.push(letter);
        else if (associations.some((r) => r.caseId === null || r.contractId === null || !scope.has(r.contractId))) plan.outsideScope.push(letter);
        else if (letter.projectId === targetProjectId) plan.alreadyMoved.push(letter);
        else plan.qualifying.push(letter);
    }
    plan.qualifying.sort((a, b) => a.id - b.id);
    plan.selected = plan.qualifying.slice(0, limit);
    return plan;
}

export function driveItemId(letter: LetterRow): string | null {
    return letter.gdFolderId || letter.gdDocumentId || null;
}

export interface DriveMetadata {
    parents?: string[] | null;
    trashed?: boolean | null;
}

export function classifyDriveLocation(metadata: DriveMetadata, sourceFolderId: string | null, targetFolderId: string): {
    location: 'IN_TARGET' | 'IN_SOURCE' | 'ELSEWHERE'; reason: string;
} {
    if (metadata.trashed) return { location: 'ELSEWHERE', reason: 'Element Dysku jest w koszu.' };
    if (metadata.parents?.includes(targetFolderId)) return { location: 'IN_TARGET', reason: '' };
    if (!sourceFolderId) return { location: 'ELSEWHERE', reason: 'Brak sourceLettersFolderId bieżącego projektu pisma.' };
    if (metadata.parents?.includes(sourceFolderId)) return { location: 'IN_SOURCE', reason: '' };
    return { location: 'ELSEWHERE', reason: `Rodzice: ${metadata.parents?.join(', ') || '(brak)'}; oczekiwano: ${sourceFolderId}.` };
}

export async function executePlan(plan: LetterPlan, targetProjectId: number, apply: boolean, ports: {
    targetFolderId: string;
    getMetadata: (id: string) => Promise<DriveMetadata>;
    moveOnDrive: (id: string, sourceFolderId: string) => Promise<void>;
    updateLetterProject: (letterId: number, projectId: number, previousProjectId: number | null) => Promise<number>;
}, noDriveCheck = false) {
    if (apply && noDriveCheck) throw new Error('--no-drive-check jest dozwolone wyłącznie w podglądzie.');
    const result = {
        moved: 0, databaseOnly: 0,
        inSource: [] as LetterRow[], inTarget: [] as LetterRow[], withoutDriveId: [] as LetterRow[],
        unchecked: [] as LetterRow[], elsewhere: [] as Array<{ letter: LetterRow; reason: string }>,
        errors: [] as Array<{ id: number; message: string }>,
    };
    for (const letter of plan.selected) {
        try {
            const itemId = driveItemId(letter);
            let location: 'IN_TARGET' | 'IN_SOURCE' | undefined;
            if (itemId) {
                if (noDriveCheck) {
                    result.unchecked.push(letter);
                    continue;
                }
                let classification;
                try {
                    classification = classifyDriveLocation(await ports.getMetadata(itemId), letter.sourceLettersFolderId, ports.targetFolderId);
                } catch (error) {
                    result.elsewhere.push({ letter, reason: `Nie można odczytać elementu ${itemId}: ${error instanceof Error ? error.message : String(error)}` });
                    continue;
                }
                if (classification.location === 'ELSEWHERE') {
                    result.elsewhere.push({ letter, reason: classification.reason });
                    continue;
                }
                location = classification.location;
                if (location === 'IN_SOURCE') result.inSource.push(letter);
                else result.inTarget.push(letter);
            } else result.withoutDriveId.push(letter);
            if (apply) {
                if (itemId && location === 'IN_SOURCE') await ports.moveOnDrive(itemId, letter.sourceLettersFolderId!);
                const affectedRows = await ports.updateLetterProject(letter.id, targetProjectId, letter.projectId);
                if (affectedRows === 0) throw new Error('Nie zmieniono wiersza Letters: ProjectId zmienił się od planowania lub pismo usunięto.');
            }
            if (location === 'IN_SOURCE') result.moved++;
            else result.databaseOnly++;
        } catch (error) {
            result.errors.push({ id: letter.id, message: error instanceof Error ? error.message : String(error) });
        }
    }
    return result;
}

export function lettersSql(contractCount: number): string {
    return `SELECT l.Id AS id, l.Number AS number, l.CreationDate AS creationDate,
       l.ProjectId AS projectId, l.OfferId AS offerId,
       p.LettersGdFolderId AS sourceLettersFolderId,
       l.GdFolderId AS gdFolderId, l.GdDocumentId AS gdDocumentId,
       lc.CaseId AS caseId, m.ContractId AS contractId, m.OfferId AS caseOfferId
FROM Letters l
LEFT JOIN Projects p ON p.Id = l.ProjectId
JOIN Letters_Cases lc ON lc.LetterId = l.Id
LEFT JOIN Cases c ON c.Id = lc.CaseId
LEFT JOIN Milestones m ON m.Id = c.MilestoneId
WHERE EXISTS (
    SELECT 1 FROM Letters_Cases scoped_lc
    JOIN Cases scoped_c ON scoped_c.Id = scoped_lc.CaseId
    JOIN Milestones scoped_m ON scoped_m.Id = scoped_c.MilestoneId
    WHERE scoped_lc.LetterId = l.Id
      AND scoped_m.ContractId IN (${Array(contractCount).fill('?').join(', ')})
)
ORDER BY l.Id, lc.CaseId`;
}
