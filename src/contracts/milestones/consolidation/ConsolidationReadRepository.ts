import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

export type ContentRow = Record<string, unknown>;
export type SqlContentSnapshot = {
    projectOurId: string;
    rows: Record<string, ContentRow[]>;
    columns: ContentRow[];
    foreignKeys: ContentRow[];
    indexes: ContentRow[];
    boundaryReferences: number;
};

/** Internal read primitive. Caller owns authorization and a consistent READ ONLY transaction.
 * No pool fallback: importing this reader must not start integrations or open a connection.
 */
export default class ConsolidationReadRepository {
    async read(projectOurId: string, milestoneIds: readonly number[], conn: PoolConnection): Promise<SqlContentSnapshot> {
        if (!projectOurId || !milestoneIds.length || milestoneIds.some(id => !Number.isSafeInteger(id) || id <= 0))
            throw new Error('INVALID_READ_SCOPE');
        const query = async (sql: string, args: unknown[] = []): Promise<ContentRow[]> => {
            // mysql2's text parser supports this per-query option; retain SQL precision and zero dates.
            const options = { sql, dateStrings: true };
            return (await conn.query<RowDataPacket[]>(options, args))[0];
        };
        const ids = (rows: ContentRow[], column = 'Id') => [...new Set(rows.map(row => Number(row[column]))
            .filter(id => Number.isSafeInteger(id) && id > 0))];
        const select = async (table: string, column: string, values: number[]) => values.length
            ? query(`SELECT * FROM ${table} WHERE ${column} IN (?)`, [values]) : [];
        const rows: Record<string, ContentRow[]> = {};
        rows.Projects = await query('SELECT * FROM Projects WHERE OurId = ?', [projectOurId]);
        if (rows.Projects.length !== 1) throw new Error('READ_SCOPE_NOT_FOUND');
        rows.Milestones = await query(`SELECT m.* FROM Milestones m JOIN Contracts c ON c.Id = m.ContractId
            WHERE c.ProjectOurId = ? AND m.Id IN (?)`, [projectOurId, [...new Set(milestoneIds)]]);
        if (rows.Milestones.length !== new Set(milestoneIds).size) throw new Error('READ_SCOPE_NOT_FOUND');
        const mids = ids(rows.Milestones);
        rows.Contracts = await query('SELECT * FROM Contracts WHERE ProjectOurId = ?', [projectOurId]);
        rows.Cases = await select('Cases', 'MilestoneId', mids);
        const cids = ids(rows.Cases);
        rows.Tasks = await select('Tasks', 'CaseId', cids);
        const tids = ids(rows.Tasks);
        rows.Tasks_Watchers = await select('Tasks_Watchers', 'TaskId', tids);
        for (const table of ['Letters_Cases', 'ProcessInstances', 'Risks', 'Securities', 'MeetingArrangements'])
            rows[table] = await select(table, 'CaseId', cids);
        rows.ProcessesStepsInstances = await select('ProcessesStepsInstances', 'ProcessInstanceId', ids(rows.ProcessInstances));
        const letterIds = [...new Set([...ids(rows.Letters_Cases, 'LetterId'), ...ids(rows.ProcessesStepsInstances, 'OurLetterId')])];
        rows.Letters = letterIds.length ? await query('SELECT * FROM Letters WHERE ProjectId = ? AND Id IN (?)',
            [rows.Projects[0].Id, letterIds]) : [];
        rows.LetterEvents = await select('LetterEvents', 'LetterId', ids(rows.Letters));
        rows.Letters_Entities = await select('Letters_Entities', 'LetterId', ids(rows.Letters));
        for (const table of ['MilestoneDates', 'MilestoneContractLinks', 'MilestoneSharingState', 'CaseTypeFolders'])
            rows[table] = await select(table, 'MilestoneId', mids);
        rows.CaseTypes = await query('SELECT * FROM CaseTypes');
        rows.CaseType_SubCaseTypes = await query('SELECT * FROM CaseType_SubCaseTypes');
        rows.MilestoneTypes = await select('MilestoneTypes', 'Id', ids(rows.Milestones, 'TypeId'));
        rows.MilestoneTypes_ContractTypes = await select('MilestoneTypes_ContractTypes', 'MilestoneTypeId', ids(rows.Milestones, 'TypeId'));

        // Count incoming references crossing the selected trees without exposing foreign content.
        let boundaryReferences = letterIds.length - rows.Letters.length;
        if (cids.length) {
            const count = await query('SELECT COUNT(*) AS n FROM Cases WHERE ParentCaseId IN (?) AND Id NOT IN (?)', [cids, cids]);
            boundaryReferences += Number(count[0].n);
        }
        if (tids.length) {
            const count = await query('SELECT COUNT(*) AS n FROM ProcessInstances WHERE TaskId IN (?) AND CaseId NOT IN (?)', [tids, cids]);
            boundaryReferences += Number(count[0].n);
        }
        const columns = await query(`SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLLATION_NAME
            FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION`);
        const foreignKeys = await query(`SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME,
            REFERENCED_COLUMN_NAME, CONSTRAINT_NAME, ORDINAL_POSITION
            FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE()
            AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`);
        const indexes = await query(`SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
            FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`);
        return { projectOurId, rows, columns, foreignKeys, indexes, boundaryReferences };
    }
}
