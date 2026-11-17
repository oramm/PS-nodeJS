import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type Batch from './ConsolidationBatch';

type Plan = ReturnType<typeof Batch.prepare>;
const tables = new Set(['Tasks', 'ProcessInstances', 'Risks', 'Securities', 'MeetingArrangements']);

/** DB primitives only. The controller owns the transaction and validates affected counts. */
export default class ConsolidationTransferRepository {
    async storage(conn: PoolConnection, readTables: string[]) {
        const writeNames = [...tables, 'Letters_Cases', 'MilestoneConsolidationOperations', 'MilestoneConsolidationNotes',
            'MilestoneConsolidationBatches', 'MilestoneContractLinks', 'MilestoneSharingRequests'].map(t => t.toLowerCase());
        const names = [...new Set([...writeNames, 'milestoneconsolidationpreviews', ...readTables.map(t => t.toLowerCase())])];
        const [engines] = await conn.query<RowDataPacket[]>(`SELECT LOWER(TABLE_NAME) AS name, ENGINE AS engine
            FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) IN (?)`, [names]);
        const [triggers] = await conn.query<RowDataPacket[]>(`SELECT TRIGGER_NAME FROM information_schema.TRIGGERS
            WHERE TRIGGER_SCHEMA = DATABASE() AND LOWER(EVENT_OBJECT_TABLE) IN (?)`, [writeNames]);
        return { names, engines, triggers };
    }
    async timestamp(conn: PoolConnection): Promise<string> {
        const [rows] = await conn.query<RowDataPacket[]>(
            "SELECT DATE_FORMAT(CURRENT_TIMESTAMP, '%Y-%m-%d %H:%i:%s') AS stamp");
        return String(rows[0].stamp);
    }
    async move(table: string, id: number, source: number, destination: number, conn: PoolConnection, timestamp: string) {
        if (!tables.has(table)) throw new Error('Unsupported transfer table');
        const [result] = await conn.query<ResultSetHeader>(
            `UPDATE ${table} SET CaseId = ?, LastUpdated = ? WHERE Id = ? AND CaseId = ?`, [destination, timestamp, id, source]);
        return result.affectedRows;
    }
    async edge(edge: Plan['letterEdges'][number], conn: PoolConnection, timestamp: string) {
        const [result] = edge.action === 'DEDUPLICATE_EXACT_EDGE'
            ? await conn.query<ResultSetHeader>('DELETE FROM Letters_Cases WHERE LetterId = ? AND CaseId = ?',
                [edge.letterId, edge.sourceCaseId])
            : await conn.query<ResultSetHeader>('UPDATE Letters_Cases SET CaseId = ?, LastUpdated = ? WHERE LetterId = ? AND CaseId = ?',
                [edge.destinationCaseId, timestamp, edge.letterId, edge.sourceCaseId]);
        return result.affectedRows;
    }
    async lock(table: 'Contracts' | 'Milestones' | 'Cases', ids: number[], conn: PoolConnection) {
        for (const id of [...new Set(ids)].sort((a, b) => a - b))
            await conn.query(`SELECT Id FROM ${table} WHERE Id = ? FOR UPDATE`, [id]);
    }
}
