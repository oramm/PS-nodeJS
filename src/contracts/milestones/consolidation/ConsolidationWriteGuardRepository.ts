import type { PoolConnection, RowDataPacket } from 'mysql2/promise';

export type LetterDestructionContext = {
    Id: number;
    GdDocumentId: string | null;
    GdFolderId: string | null;
};

export default class ConsolidationWriteGuardRepository {
    async structuralOperations(kind: 'milestone' | 'case' | 'contract' | 'project', id: number, conn: PoolConnection) {
        const queries = {
            milestone: `SELECT o.OperationId, o.SourceMilestoneId, m.ContractId, m.TypeId, m.OfferId, m.GdFolderId
                FROM MilestoneConsolidationOperations o JOIN Milestones m ON m.Id = o.DestinationMilestoneId WHERE m.Id = ?`,
            case: `SELECT o.OperationId, o.SourceMilestoneId, c.MilestoneId, c.ParentCaseId, c.TypeId, c.GdFolderId
                FROM MilestoneConsolidationOperations o JOIN Cases c ON c.MilestoneId = o.DestinationMilestoneId WHERE c.Id = ?`,
            contract: `SELECT o.OperationId, o.SourceMilestoneId, c.ProjectOurId, c.TypeId, c.GdFolderId, c.OurIdRelated
                FROM MilestoneConsolidationOperations o JOIN Milestones m ON m.Id = o.DestinationMilestoneId
                JOIN Contracts c ON c.Id = m.ContractId WHERE c.Id = ?`,
            project: `SELECT o.OperationId, o.SourceMilestoneId, p.OurId, p.GdFolderId
                FROM MilestoneConsolidationOperations o JOIN Projects p ON p.OurId = o.ProjectOurId WHERE p.Id = ?`,
        };
        return (await conn.query<RowDataPacket[]>(queries[kind], [id]))[0];
    }
    async destinationOperations(ids: number[], conn: PoolConnection) {
        if (!ids.length) return [];
        return (await conn.query<RowDataPacket[]>(`SELECT OperationId, DestinationMilestoneId FROM MilestoneConsolidationOperations
            WHERE DestinationMilestoneId IN (?)`, [ids]))[0];
    }
    async contractDestinationOperations(id: number, moving: boolean, conn: PoolConnection) {
        return (await conn.query<RowDataPacket[]>(
            `SELECT o.OperationId, o.DestinationMilestoneId FROM MilestoneConsolidationOperations o
            JOIN Milestones m ON m.Id = o.DestinationMilestoneId JOIN Contracts c ON c.Id = m.ContractId
            WHERE c.Id = ?` + (moving ? ' OR c.OurIdRelated = (SELECT OurId FROM OurContractsData WHERE Id = ?)' : ''),
            moving ? [id, id] : [id]))[0];
    }
    async taskSourceOperations(conn: PoolConnection) {
        return (await conn.query<RowDataPacket[]>(
            `SELECT o.OperationId, o.SourceMilestoneId FROM MilestoneConsolidationOperations o
            WHERE EXISTS (SELECT 1 FROM Cases c JOIN Tasks t ON t.CaseId = c.Id
                WHERE c.MilestoneId = o.SourceMilestoneId) LIMIT 1`))[0];
    }
    async letterCases(id: number, conn: PoolConnection) {
        const [letters] = await conn.query<(RowDataPacket & LetterDestructionContext)[]>(
            'SELECT Id, GdDocumentId, GdFolderId FROM Letters WHERE Id = ? FOR UPDATE', [id]);
        const [cases] = await conn.query<(RowDataPacket & { CaseId: number })[]>(
            'SELECT CaseId FROM Letters_Cases WHERE LetterId = ? FOR UPDATE', [id]);
        return { letters, cases };
    }
    async securityCases(ids: number[], conn: PoolConnection) {
        if (!ids.length) return [];
        return (await conn.query<(RowDataPacket & { Id: number; CaseId: number })[]>(
            'SELECT Id, CaseId FROM Securities WHERE Id IN (?)', [ids]))[0];
    }
    async processParents(ids: number[], conn: PoolConnection) {
        if (!ids.length) return [];
        return (await conn.query<(RowDataPacket & { Id: number; CaseId: number; TaskId: number | null })[]>(
            'SELECT Id, CaseId, TaskId FROM ProcessInstances WHERE Id IN (?)', [ids]))[0];
    }
    async taskCases(ids: number[], conn: PoolConnection) {
        if (!ids.length) return [];
        return (await conn.query<(RowDataPacket & { Id: number; CaseId: number })[]>(
            'SELECT Id, CaseId FROM Tasks WHERE Id IN (?)', [ids]))[0];
    }
    async meetingCases(id: number, conn: PoolConnection) {
        return (await conn.query<(RowDataPacket & { CaseId: number })[]>(
            'SELECT DISTINCT CaseId FROM MeetingArrangements WHERE MeetingId = ?', [id]))[0];
    }
    async contractMeetingCases(id: number, moving: boolean, conn: PoolConnection) {
        return (await conn.query<(RowDataPacket & { CaseId: number })[]>(
            `SELECT DISTINCT a.CaseId FROM MeetingArrangements a
            JOIN Meetings m ON m.Id = a.MeetingId
            JOIN Contracts c ON c.Id = m.ContractId
            WHERE c.Id = ?` + (moving ? ' OR c.OurIdRelated = (SELECT OurId FROM OurContractsData WHERE Id = ?)' : ''),
            moving ? [id, id] : [id]))[0];
    }
    async contractSourceOperations(id: number, moving: boolean, conn: PoolConnection) {
        return (await conn.query<RowDataPacket[]>(
            `SELECT o.OperationId, o.SourceMilestoneId FROM MilestoneConsolidationOperations o
            JOIN Milestones m ON m.Id = o.SourceMilestoneId
            JOIN Contracts c ON c.Id = m.ContractId
            WHERE c.Id = ?` + (moving ? ' OR c.OurIdRelated = (SELECT OurId FROM OurContractsData WHERE Id = ?)' : ''),
            moving ? [id, id] : [id]))[0];
    }
    async caseParents(ids: number[], conn: PoolConnection) {
        if (!ids.length) return [];
        return (await conn.query<(RowDataPacket & { Id: number; MilestoneId: number })[]>('SELECT Id, MilestoneId FROM Cases WHERE Id IN (?)', [ids]))[0];
    }
    async sourceOperations(ids: number[], conn: PoolConnection) {
        if (!ids.length) return [];
        return (await conn.query<RowDataPacket[]>(`SELECT OperationId, SourceMilestoneId FROM MilestoneConsolidationOperations
            WHERE SourceMilestoneId IN (?)`, [ids]))[0];
    }
}
