import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { TransferNote } from './ConsolidationNote';

export default class ConsolidationNoteRepository {
    /** Operation-scoped read; the controller authorizes current and historical participants. */
    async findForOperation(operationId: string, conn: PoolConnection) {
        const options = { sql: `SELECT OperationId, SourceEntity, SourceId, NoteKind,
            DestinationEntity, DestinationId, SourceContractId, ActorId, Body, SnapshotJSON, CreatedAt
            FROM MilestoneConsolidationNotes WHERE OperationId = ?
            ORDER BY CreatedAt, SourceEntity, SourceId, NoteKind`, dateStrings: true };
        return (await conn.query<RowDataPacket[]>(options, [operationId]))[0];
    }
    /** Caller owns transaction and authorization. Duplicate keys fail, never overwrite prior evidence. */
    async add(notes: readonly TransferNote[], conn: PoolConnection): Promise<void> {
        for (const note of notes) {
            await conn.query(`INSERT INTO MilestoneConsolidationNotes
                (OperationId, SourceEntity, SourceId, NoteKind, DestinationEntity, DestinationId, SourceContractId, ActorId, Body, SnapshotJSON)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [note.operationId, note.sourceEntity, note.sourceId, note.noteKind,
                note.destinationEntity, note.destinationId, note.sourceContractId, note.actorId, note.body, note.snapshotJSON]);
        }
    }
    /** Internal read only; controller must authorize the destination and operation participants first. */
    async findAtDestination(entity: 'Milestones' | 'Cases', id: number, conn: PoolConnection) {
        const options = { sql: `SELECT OperationId, SourceEntity, SourceId, NoteKind, DestinationEntity, DestinationId,
            SourceContractId, ActorId, Body, SnapshotJSON, CreatedAt FROM MilestoneConsolidationNotes
            WHERE DestinationEntity = ? AND DestinationId = ? ORDER BY CreatedAt, OperationId, SourceEntity, SourceId, NoteKind`, dateStrings: true };
        return (await conn.query<RowDataPacket[]>(options, [entity, id]))[0];
    }
}
