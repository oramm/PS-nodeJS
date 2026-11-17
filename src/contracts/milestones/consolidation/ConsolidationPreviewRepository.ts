import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import Preview from './ConsolidationPreview';

export default class ConsolidationPreviewRepository {
    private async rows(sql: string, values: unknown[], conn: PoolConnection) {
        return (await conn.query<RowDataPacket[]>(sql, values))[0];
    }
    async participants(ids: number[], conn: PoolConnection) {
        const milestones = await this.rows('SELECT Id, ContractId FROM Milestones WHERE Id IN (?)', [ids], conn);
        const links = await this.rows('SELECT MilestoneId, ContractId FROM MilestoneContractLinks WHERE MilestoneId IN (?)', [ids], conn);
        const contractIds = [...new Set([...milestones.map(m => Number(m.ContractId)), ...links.map(l => Number(l.ContractId))])];
        const contracts = contractIds.length ? await this.rows('SELECT Id, ProjectOurId FROM Contracts WHERE Id IN (?)', [contractIds], conn) : [];
        return { milestones, links, contractIds, contracts };
    }
    async header(id: string, conn: PoolConnection) {
        return (await this.rows(`SELECT PreviewId, ActorId, ProjectOurId, SourceMilestoneId, DestinationMilestoneId, Revision
            FROM MilestoneConsolidationPreviews WHERE PreviewId=?`, [id], conn))[0];
    }
    async contracts(ids: number[], conn: PoolConnection) {
        return this.rows('SELECT Id, ProjectOurId FROM Contracts WHERE Id IN (?)', [ids], conn);
    }
    async content(id: string, conn: PoolConnection): Promise<string> {
        return (await this.rows('SELECT SnapshotJSON FROM MilestoneConsolidationPreviews WHERE PreviewId=?', [id], conn))[0]?.SnapshotJSON;
    }
    async add(preview: ReturnType<typeof Preview.create>, conn: PoolConnection) {
        const { scope, request } = preview.content;
        await conn.query(`INSERT INTO MilestoneConsolidationPreviews
            (PreviewId, ActorId, ProjectOurId, SourceMilestoneId, DestinationMilestoneId, Revision, SnapshotJSON)
            VALUES (?, ?, ?, ?, ?, ?, ?)`, [preview.previewId, scope.actorId, scope.projectOurId,
            request.sourceMilestoneId, request.destinationMilestoneId, preview.revision, Preview.serialize(preview)]);
    }
}
