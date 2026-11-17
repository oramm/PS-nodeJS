import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { OperationRecord } from './ConsolidationOperation';

export default class ConsolidationOperationRepository {
    /** Read-only UI resume projection; source only, never a write authorization. */
    async forSource(sourceId: number, conn: PoolConnection): Promise<OperationRecord | undefined> {
        const [rows] = await conn.query<RowDataPacket[]>(`SELECT OperationId AS operationId, ProjectOurId AS projectOurId,
            SourceMilestoneId AS sourceMilestoneId, DestinationMilestoneId AS destinationMilestoneId,
            ActorId AS actorId, State AS state, Revision AS revision, SnapshotJSON AS snapshotJSON
            FROM MilestoneConsolidationOperations WHERE SourceMilestoneId = ? ORDER BY OperationId`, [sourceId]);
        if (rows.length > 1) throw new Error('Ambiguous source consolidation');
        return rows[0] as OperationRecord | undefined;
    }
    async involving(ids: number[], conn: PoolConnection): Promise<string[]> {
        const [rows] = await conn.query<RowDataPacket[]>(`SELECT OperationId FROM MilestoneConsolidationOperations
            WHERE SourceMilestoneId IN (?) OR DestinationMilestoneId IN (?) ORDER BY OperationId FOR UPDATE`, [ids, ids]);
        return rows.map(row => String(row.OperationId));
    }
    async add(r: OperationRecord, conn: PoolConnection) {
        await conn.query(`INSERT INTO MilestoneConsolidationOperations
            (OperationId, ProjectOurId, SourceMilestoneId, DestinationMilestoneId, ActorId, State, Revision, SnapshotJSON)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [r.operationId, r.projectOurId, r.sourceMilestoneId, r.destinationMilestoneId, r.actorId, r.state, r.revision, r.snapshotJSON]);
    }
    /** Caller handles zero affected rows as stale and rolls back every effect. */
    async edit(r: OperationRecord, expectedRevision: string, conn: PoolConnection): Promise<boolean> {
        const [result] = await conn.query<ResultSetHeader>(`UPDATE MilestoneConsolidationOperations SET State = ?, Revision = ?, SnapshotJSON = ?
            WHERE OperationId = ? AND Revision = ? AND ProjectOurId = ? AND SourceMilestoneId = ? AND DestinationMilestoneId = ? AND ActorId = ?`,
        [r.state, r.revision, r.snapshotJSON, r.operationId, expectedRevision, r.projectOurId, r.sourceMilestoneId, r.destinationMilestoneId, r.actorId]);
        return result.affectedRows === 1;
    }
    /** Internal read: no pool fallback, controller owns transaction and current participant authorization. */
    async find(id: string, conn: PoolConnection, lock = true): Promise<OperationRecord | undefined> {
        const [rows] = await conn.query<RowDataPacket[]>(`SELECT OperationId AS operationId, ProjectOurId AS projectOurId,
            SourceMilestoneId AS sourceMilestoneId, DestinationMilestoneId AS destinationMilestoneId,
            ActorId AS actorId, State AS state, Revision AS revision, SnapshotJSON AS snapshotJSON
            FROM MilestoneConsolidationOperations WHERE OperationId = ?` + (lock ? ' FOR UPDATE' : ''), [id]);
        return rows[0] as OperationRecord | undefined;
    }
}
