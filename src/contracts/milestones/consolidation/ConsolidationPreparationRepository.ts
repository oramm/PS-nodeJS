import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { PreparationState, PreparationCase } from './ConsolidationPreparation';
import { canonical } from './ConsolidationPreview';
import type { ContentRow } from './ConsolidationReadRepository';

export default class ConsolidationPreparationRepository {
    async find(actorId: number, requestId: string, conn: PoolConnection): Promise<PreparationState | undefined> {
        const [rows] = await conn.query<RowDataPacket[]>('SELECT StateJSON FROM MilestoneConsolidationPreparations WHERE ActorId=? AND RequestId=? FOR UPDATE', [actorId, requestId]);
        return rows.length ? JSON.parse(rows[0].StateJSON) : undefined;
    }
    async add(s: PreparationState, conn: PoolConnection) {
        await conn.query('INSERT INTO MilestoneConsolidationPreparations (PreparationId, ActorId, RequestId, StateJSON) VALUES (?, ?, ?, ?)',
            [s.id, s.actorId, s.requestId, canonical(s)]);
        for (const c of s.cases) await conn.query('INSERT INTO MilestoneConsolidationTargetClaims (SourceObjectId, PreparationId) VALUES (?, ?)', [c.sourceId, s.id]);
    }
    async save(s: PreparationState, conn: PoolConnection) {
        const [result] = await conn.query<ResultSetHeader>('UPDATE MilestoneConsolidationPreparations SET StateJSON=? WHERE PreparationId=? AND ActorId=? AND RequestId=?',
            [canonical(s), s.id, s.actorId, s.requestId]);
        return result.affectedRows;
    }
    async claims(ids: number[], conn: PoolConnection) {
        return (await conn.query<RowDataPacket[]>('SELECT SourceObjectId, PreparationId FROM MilestoneConsolidationTargetClaims WHERE SourceObjectId IN (?) FOR UPDATE', [ids]))[0];
    }
    async storage(names: string[], conn: PoolConnection) {
        const [rows] = await conn.query<RowDataPacket[]>('SELECT LOWER(TABLE_NAME) AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND LOWER(TABLE_NAME) IN (?)', [names]);
        const [triggers] = await conn.query<RowDataPacket[]>(`SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()
            AND LOWER(EVENT_OBJECT_TABLE) IN ('milestoneconsolidationpreparations','milestoneconsolidationtargetclaims','casetypefolders')`);
        return { names, engines: rows, triggers };
    }
    async insertCase(c: PreparationCase, milestoneId: number, conn: PoolConnection): Promise<ContentRow> {
        const [result] = await conn.query<ResultSetHeader>('INSERT INTO Cases (MilestoneId, TypeId, ParentCaseId, Name, Number, SubCaseNumber) VALUES (?, ?, ?, ?, ?, ?)',
            [milestoneId, c.typeId, c.parentId, c.name, c.number, c.subCaseNumber]);
        return this.caseRow(result.insertId, conn);
    }
    async caseRow(id: number, conn: PoolConnection): Promise<ContentRow> {
        const options = { sql: 'SELECT * FROM Cases WHERE Id=?', dateStrings: true };
        return (await conn.query<RowDataPacket[]>(options, [id]))[0][0];
    }
    async attachFolder(id: number, folderId: string, conn: PoolConnection) {
        return (await conn.query<ResultSetHeader>("UPDATE Cases SET GdFolderId=? WHERE Id=? AND GdFolderId=''", [folderId, id]))[0].affectedRows;
    }
    async insertTypeFolder(milestoneId: number, typeId: number, folderId: string, conn: PoolConnection): Promise<ContentRow> {
        await conn.query('INSERT INTO CaseTypeFolders (MilestoneId, CaseTypeId, GdFolderId) VALUES (?, ?, ?)', [milestoneId, typeId, folderId]);
        const options = { sql: 'SELECT * FROM CaseTypeFolders WHERE MilestoneId=? AND CaseTypeId=?', dateStrings: true };
        return (await conn.query<RowDataPacket[]>(options, [milestoneId, typeId]))[0][0];
    }
    /** Global alias inventory; no folder names or unrelated business content returned. */
    async aliases(id: string, conn: PoolConnection): Promise<{ table: string; key: string }[]> {
        const result: { table: string; key: string }[] = [];
        const [columns] = await conn.query<RowDataPacket[]>(`SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME LIKE '%FolderId'`);
        const known = ['Projects', 'Contracts', 'Milestones', 'Cases', 'Letters', 'CaseTypeFolders'];
        const tables = [...new Set(columns.map(c => String(c.TABLE_NAME)))];
        if (known.some(t => !tables.some(other => other.toLowerCase() === t.toLowerCase()))) throw new Error('UNVERIFIED_FOLDER_SCHEMA');
        for (const rawTable of tables) {
            if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(rawTable)) throw new Error('UNVERIFIED_FOLDER_SCHEMA');
            const table = known.find(t => t.toLowerCase() === rawTable.toLowerCase()) ?? rawTable;
            const key = table === 'CaseTypeFolders' ? "CONCAT(MilestoneId, ':', CaseTypeId)" : 'CAST(Id AS CHAR)';
            const fields = columns.filter(c => String(c.TABLE_NAME).toLowerCase() === table.toLowerCase()).map(c => String(c.COLUMN_NAME));
            // FolderId itself is valid too; validate SQL identifiers separately from the suffix.
            if (!fields.length || fields.some(f => !/^[A-Za-z][A-Za-z0-9_]*$/.test(f) || !/FolderId$/.test(f))) throw new Error('UNVERIFIED_FOLDER_SCHEMA');
            const where = fields.map(f => '`' + f + '`=?').join(' OR ');
            if (!known.includes(table)) {
                // Future/other folder-bearing tables cannot be silently excluded from the global check.
                const [rows] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM \`${table}\` WHERE ${where}`, fields.map(() => id));
                if (Number(rows[0].n)) result.push({ table, key: '*' });
                continue;
            }
            const [rows] = await conn.query<RowDataPacket[]>(`SELECT ${key} AS objectKey FROM ${table} WHERE ${where}`, fields.map(() => id));
            result.push(...rows.map(row => ({ table, key: String(row.objectKey) })));
        }
        return result;
    }
}
