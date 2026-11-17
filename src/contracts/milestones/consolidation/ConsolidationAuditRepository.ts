import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { BatchAudit } from './ConsolidationAudit';

export default class ConsolidationAuditRepository {
    /** Same caller transaction as effects, notes and receipt. A duplicate must roll back the whole batch. */
    async add(audit: BatchAudit, conn: PoolConnection) {
        await conn.query(`INSERT INTO MilestoneConsolidationBatches
            (OperationId, ActorId, RequestId, PreviewId, ProjectOurId, SourceMilestoneId, DestinationMilestoneId,
             BeforeRevision, ContentHash, SnapshotJSON) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [audit.operationId, audit.actorId, audit.requestId, audit.previewId, audit.projectOurId,
            audit.sourceMilestoneId, audit.destinationMilestoneId, audit.beforeRevision, audit.contentHash, audit.snapshotJSON]);
    }
    /** Internal header lookup; controller must authorize all operation participants before reading content. */
    async headers(operationId: string, conn: PoolConnection) {
        const options = { sql: `SELECT OperationId, ActorId, RequestId, PreviewId, ProjectOurId,
            SourceMilestoneId, DestinationMilestoneId, BeforeRevision, ContentHash, CreatedAt
            FROM MilestoneConsolidationBatches WHERE OperationId = ? ORDER BY CreatedAt, ActorId, RequestId`, dateStrings: true };
        return (await conn.query<RowDataPacket[]>(options, [operationId]))[0];
    }
    async content(operationId: string, actorId: number, requestId: string, conn: PoolConnection): Promise<string | undefined> {
        const [rows] = await conn.query<RowDataPacket[]>(`SELECT SnapshotJSON FROM MilestoneConsolidationBatches
            WHERE OperationId = ? AND ActorId = ? AND RequestId = ?`, [operationId, actorId, requestId]);
        return rows[0]?.SnapshotJSON;
    }
}
