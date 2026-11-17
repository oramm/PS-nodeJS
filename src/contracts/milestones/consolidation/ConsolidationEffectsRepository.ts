import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import ReadRepository, { ContentRow, SqlContentSnapshot } from './ConsolidationReadRepository';

export type EffectsSnapshot = SqlContentSnapshot & {
    caseTriggers: ContentRow[];
    parentScopeExpression: string;
    nameWeights: { name: string; weight: string }[];
    folderReferences: { table: string; key: string; milestoneId: number | null; field: string; folderId: string }[];
    folderReferenceScope: 'SELECTED_PROJECT_ONLY';
};

/** No authorization, transaction or external transport here; caller supplies all three boundaries. */
export default class ConsolidationEffectsRepository extends ReadRepository {
    async readEffects(projectOurId: string, milestoneIds: readonly number[], proposedNames: readonly string[],
        conn: PoolConnection): Promise<EffectsSnapshot> {
        const snapshot = await this.read(projectOurId, milestoneIds, conn);
        const query = async (sql: string, values: unknown[] = []): Promise<ContentRow[]> => {
            const options = { sql, dateStrings: true };
            return (await conn.query<RowDataPacket[]>(options, values))[0];
        };
        const caseTriggers = await query(`SELECT TRIGGER_NAME, EVENT_MANIPULATION, ACTION_TIMING, ACTION_STATEMENT
            FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND EVENT_OBJECT_TABLE = 'cases'`);
        const generated = await query(`SELECT GENERATION_EXPRESSION FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cases' AND COLUMN_NAME='ParentCaseIdForUnique'`);
        const parentScopeExpression=String(generated[0]?.GENERATION_EXPRESSION||'');
        snapshot.indexes=await query(`SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME, SUB_PART
            FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`);
        const meetingIds=[...new Set(snapshot.rows.MeetingArrangements.map(a=>Number(a.MeetingId)))];
        snapshot.rows.Meetings=meetingIds.length?await query(`SELECT m.* FROM Meetings m JOIN Contracts c ON c.Id=m.ContractId
            WHERE c.ProjectOurId=? AND m.Id IN (?)`,[projectOurId,meetingIds]):[];
        snapshot.rows.ContractMeetingNotes=meetingIds.length?await query(`SELECT n.* FROM ContractMeetingNotes n
            JOIN Contracts c ON c.Id=n.ContractId WHERE c.ProjectOurId=? AND n.MeetingId IN (?)`,[projectOurId,meetingIds]):[];
        snapshot.boundaryReferences+=meetingIds.length-snapshot.rows.Meetings.length;
        const nameColumn = snapshot.columns.find(c => String(c.TABLE_NAME).toLowerCase() === 'cases' && c.COLUMN_NAME === 'Name');
        const names = [...new Set([...proposedNames, ...snapshot.rows.Cases.map(c => c.Name)]
            .filter((name): name is string => typeof name === 'string'))];
        const nameWeights: EffectsSnapshot['nameWeights'] = [];
        // Exact DB comparison, including case/accent equivalence and trailing-space semantics.
        // Never interpolate a metadata/user-provided collation into SQL.
        if (nameColumn?.COLLATION_NAME === 'utf8mb3_polish_ci') {
            for (const name of names) {
                if([...name].length>200 || [...name].some(ch=>ch.codePointAt(0)!>0xffff))continue;
                const result = await query(`SELECT HEX(WEIGHT_STRING(RTRIM(CONVERT(? USING utf8mb3))
                    COLLATE utf8mb3_polish_ci)) AS Weight`, [name]);
                nameWeights.push({ name, weight: String(result[0].Weight) });
            }
        }
        const folderRows: Record<string, ContentRow[]> = {
            Projects: snapshot.rows.Projects, Contracts: snapshot.rows.Contracts,
            Milestones: await query(`SELECT m.Id, m.GdFolderId FROM Milestones m JOIN Contracts c ON c.Id=m.ContractId
                WHERE c.ProjectOurId=?`, [projectOurId]),
            Cases: await query(`SELECT a.Id, a.MilestoneId, a.GdFolderId FROM Cases a JOIN Milestones m ON m.Id=a.MilestoneId
                JOIN Contracts c ON c.Id=m.ContractId WHERE c.ProjectOurId=?`, [projectOurId]),
            CaseTypeFolders: await query(`SELECT f.* FROM CaseTypeFolders f JOIN Milestones m ON m.Id=f.MilestoneId
                JOIN Contracts c ON c.Id=m.ContractId WHERE c.ProjectOurId=?`, [projectOurId]),
            Letters: await query('SELECT Id, GdFolderId FROM Letters WHERE ProjectId=?', [snapshot.rows.Projects[0].Id]),
        };
        const folderReferences: EffectsSnapshot['folderReferences'] = [];
        for (const [table, rows] of Object.entries(folderRows)) for (const row of rows)
            for (const [field, value] of Object.entries(row)) if (/FolderId$/.test(field) && typeof value === 'string' && value)
                folderReferences.push({ table, key: table === 'CaseTypeFolders' ? `${row.MilestoneId}:${row.CaseTypeId}` : String(row.Id),
                    milestoneId: table === 'Milestones' ? Number(row.Id) : row.MilestoneId == null ? null : Number(row.MilestoneId),
                    field, folderId: value });
        return { ...snapshot, caseTriggers, parentScopeExpression, nameWeights, folderReferences, folderReferenceScope: 'SELECTED_PROJECT_ONLY' };
    }
}
