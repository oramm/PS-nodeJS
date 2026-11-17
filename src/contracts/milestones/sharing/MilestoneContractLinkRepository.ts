import mysql, { RowDataPacket } from 'mysql2/promise';
import BaseRepository from '../../../repositories/BaseRepository';
import ToolsDb from '../../../tools/ToolsDb';
import MilestoneContractLink, { MilestoneContractLinkData } from './MilestoneContractLink';
import type { LinkContractContext, LinkMilestoneContext } from './MilestoneContractLink';

export default class MilestoneContractLinkRepository extends BaseRepository<MilestoneContractLink> {
    constructor() {
        super('MilestoneContractLinks');
    }

    protected mapRowToModel(row: RowDataPacket): MilestoneContractLink {
        return new MilestoneContractLink({
            milestoneId: row.MilestoneId,
            contractId: row.ContractId,
        });
    }

    async find(
        params: Partial<MilestoneContractLinkData> = {},
        conn?: mysql.PoolConnection
    ): Promise<MilestoneContractLink[]> {
        const { condition, values } = this.makeAndConditions(params);
        const [rows] = await (conn || ToolsDb.pool).query<RowDataPacket[]>(
            `SELECT MilestoneId, ContractId FROM MilestoneContractLinks
             WHERE ${condition} ORDER BY MilestoneId, ContractId`,
            values
        );
        return rows.map((row) => this.mapRowToModel(row));
    }

    private makeAndConditions(params: Partial<MilestoneContractLinkData>) {
        const clauses: string[] = [];
        const values: number[] = [];
        if (params.milestoneId !== undefined) {
            clauses.push('MilestoneId = ?');
            values.push(params.milestoneId);
        }
        if (params.contractId !== undefined) {
            clauses.push('ContractId = ?');
            values.push(params.contractId);
        }
        return { condition: clauses.join(' AND ') || '1', values };
    }

    async lockMilestone(id: number, conn: mysql.PoolConnection): Promise<LinkMilestoneContext | undefined> {
        const [rows] = await conn.query<RowDataPacket[]>(
            'SELECT Id, ContractId, OfferId FROM Milestones WHERE Id = ? FOR UPDATE', [id]
        );
        return rows[0] && { id: rows[0].Id, contractId: rows[0].ContractId, offerId: rows[0].OfferId };
    }

    async lockContracts(ids: number[], conn: mysql.PoolConnection): Promise<LinkContractContext[]> {
        const rows: LinkContractContext[] = [];
        // One PK lookup per row makes lock order explicit, independent of query plans.
        for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
            const [result] = await conn.query<RowDataPacket[]>(
                'SELECT Id, ProjectOurId FROM Contracts WHERE Id = ? FOR UPDATE', [id]
            );
            if (result[0]) rows.push({ id: result[0].Id, projectOurId: result[0].ProjectOurId });
        }
        return rows;
    }

    async addInDb(item: MilestoneContractLink, conn?: mysql.PoolConnection, isPartOfTransaction = false): Promise<void> {
        if (!conn || !isPartOfTransaction) throw new Error('Caller-owned transaction required');
        // A no-op on this table's only unique key; never suppress FK/other SQL failures.
        await conn.query(
            `INSERT INTO MilestoneContractLinks (MilestoneId, ContractId) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE MilestoneId = VALUES(MilestoneId)`,
            [item.milestoneId, item.contractId]
        );
    }

    async deleteFromDb(item: MilestoneContractLink, conn?: mysql.PoolConnection, isPartOfTransaction = false): Promise<void> {
        if (!conn || !isPartOfTransaction) throw new Error('Caller-owned transaction required');
        await conn.query(
            'DELETE FROM MilestoneContractLinks WHERE MilestoneId = ? AND ContractId = ?',
            [item.milestoneId, item.contractId]
        );
    }

    async editInDb(): Promise<never> {
        throw new Error('Association identity is immutable; use add/delete');
    }
}