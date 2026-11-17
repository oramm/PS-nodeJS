import { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { randomUUID } from 'crypto';
import ToolsDb from '../../../tools/ToolsDb';

export default class MilestoneSharingRepository {
    async rows(sql: string, values: any[] = [], conn?: PoolConnection): Promise<any[]> {
        return (await (conn || ToolsDb.pool).query<RowDataPacket[]>(sql, values))[0];
    }
    async acquire(conn: PoolConnection) {
        return (await this.rows("SELECT GET_LOCK(CONCAT(DATABASE(), ':ps-mc-lifecycle'), 30) ok", [], conn))[0].ok === 1;
    }
    async release(conn: PoolConnection) {
        await conn.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':ps-mc-lifecycle'))");
    }
    async snapshot(id: number, conn?: PoolConnection) {
        const m = (await this.rows('SELECT * FROM Milestones WHERE Id = ?' + (conn ? ' FOR UPDATE' : ''), [id], conn))[0];
        const links = await this.rows('SELECT * FROM MilestoneContractLinks WHERE MilestoneId = ? ORDER BY ContractId', [id], conn);
        const dates = await this.rows('SELECT * FROM MilestoneDates WHERE MilestoneId = ? ORDER BY Id', [id], conn);
        const state = (await this.rows('SELECT Revision FROM MilestoneSharingState WHERE MilestoneId = ?', [id], conn))[0];
        return { m, links, dates, revision: state?.Revision || null };
    }
    async contracts(ids: number[], conn?: PoolConnection) {
        if (!ids.length) return [];
        return this.rows('SELECT * FROM Contracts WHERE Id IN (?) ORDER BY Id' + (conn ? ' FOR UPDATE' : ''), [[...new Set(ids)]], conn);
    }
    async availability(typeId: number, contractTypeId: number, conn?: PoolConnection) {
        return this.rows('SELECT * FROM MilestoneTypes_ContractTypes WHERE MilestoneTypeId = ? AND ContractTypeId = ?', [typeId, contractTypeId], conn);
    }
    async contractCreationCandidates(projectOurId: string, contractTypeId: number) {
        return this.rows(`SELECT m.Id, m.Name, m.ContractId, c.Name AS SourceContractName,
                c.Alias AS SourceContractAlias, o.OurId AS SourceContractOurId
            FROM Milestones m
            JOIN Contracts c ON c.Id = m.ContractId
            LEFT JOIN OurContractsData o ON o.Id = c.Id
            JOIN MilestoneTypes_ContractTypes available
                ON available.MilestoneTypeId = m.TypeId AND available.ContractTypeId = ?
            WHERE c.ProjectOurId = ? AND m.TypeId = 5 AND m.OfferId IS NULL
            ORDER BY m.Id`, [contractTypeId, projectOurId]);
    }
    async creationProject(id: number, conn?: PoolConnection) {
        return (await this.rows('SELECT Id, OurId, GdFolderId FROM Projects WHERE Id = ?', [id], conn))[0];
    }
    async creationContractType(id: number, conn?: PoolConnection) {
        return (await this.rows('SELECT Id, IsOur FROM ContractTypes WHERE Id = ?', [id], conn))[0];
    }
    async creationReceipt(actor: number, requestId: string, conn?: PoolConnection) {
        return (await this.rows(`SELECT Payload, Result FROM MilestoneSharingRequests
            WHERE ActorId = ? AND Endpoint = 'POST:/contractReact/shared' AND RequestId = ?`,
            [actor, requestId], conn))[0];
    }
    async reserveCreation(actor: number, requestId: string, payload: string, result: any, conn: PoolConnection) {
        await conn.query(`INSERT INTO MilestoneSharingRequests (ActorId, Endpoint, RequestId, Payload, Result)
            VALUES (?, 'POST:/contractReact/shared', ?, ?, ?)`, [actor, requestId, payload, JSON.stringify(result)]);
    }
    async updateCreation(actor: number, requestId: string, result: any, conn?: PoolConnection) {
        await (conn || ToolsDb.pool).query(`UPDATE MilestoneSharingRequests SET Result = ?
            WHERE ActorId = ? AND Endpoint = 'POST:/contractReact/shared' AND RequestId = ?`,
            [JSON.stringify(result), actor, requestId]);
    }
    async ownedMilestones(contractId: number) {
        return this.rows('SELECT Id, TypeId, Name FROM Milestones WHERE ContractId = ? ORDER BY Id', [contractId]);
    }
    async caseCount(milestoneId: number) {
        return (await this.rows('SELECT COUNT(*) AS Count FROM Cases WHERE MilestoneId = ?', [milestoneId]))[0].Count as number;
    }
    async uniqueConflicts(typeId: number, contractId: number, exclude?: number, conn?: PoolConnection) {
        return this.rows(`SELECT DISTINCT m.Id FROM Milestones m JOIN MilestoneTypes t ON t.Id = m.TypeId
            WHERE t.IsUniquePerContract = 1 AND m.TypeId = ? AND m.Id <> ?
            AND (m.ContractId = ? OR EXISTS (SELECT 1 FROM MilestoneContractLinks l WHERE l.MilestoneId = m.Id AND l.ContractId = ?))`,
            [typeId, exclude || 0, contractId, contractId], conn);
    }
    async ownedConflict(typeId: number, contractId: number, exclude: number, conn: PoolConnection) {
        return this.rows('SELECT Id FROM Milestones WHERE ContractId = ? AND TypeId = ? AND Id <> ?',
            [contractId, typeId, exclude], conn);
    }
    async touch(id: number, conn?: PoolConnection) {
        await (conn || ToolsDb.pool).query(`INSERT INTO MilestoneSharingState (MilestoneId, Revision) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE Revision = VALUES(Revision)`, [id, randomUUID()]);
    }
    async receipt(actor: number, endpoint: string, request: string, conn: PoolConnection) {
        return (await this.rows('SELECT Payload, Result FROM MilestoneSharingRequests WHERE ActorId = ? AND Endpoint = ? AND RequestId = ?', [actor, endpoint, request.toLowerCase()], conn))[0];
    }
    async saveReceipt(actor: number, endpoint: string, request: string, payload: string, result: any, conn: PoolConnection) {
        await conn.query('INSERT INTO MilestoneSharingRequests (ActorId, Endpoint, RequestId, Payload, Result) VALUES (?, ?, ?, ?, ?)',
            [actor, endpoint, request.toLowerCase(), payload, JSON.stringify(result)]);
    }
    async attach(id: number, target: number, conn: PoolConnection) {
        await conn.query(`INSERT INTO MilestoneContractLinks (MilestoneId, ContractId) VALUES (?, ?)
            ON DUPLICATE KEY UPDATE ShortcutStatus = IF(ShortcutStatus = 'FAILED', 'PENDING', ShortcutStatus)`, [id, target]);
    }
    async updateReceipt(actor: number, endpoint: string, request: string, result: any, conn: PoolConnection) {
        await conn.query('UPDATE MilestoneSharingRequests SET Result = ? WHERE ActorId = ? AND Endpoint = ? AND RequestId = ?',
            [JSON.stringify(result), actor, endpoint, request.toLowerCase()]);
    }
    async shortcutState(id: number, target: number, shortcutId: string, status: 'PENDING' | 'READY', conn: PoolConnection) {
        await conn.query('UPDATE MilestoneContractLinks SET ShortcutId = ?, ShortcutStatus = ? WHERE MilestoneId = ? AND ContractId = ?',
            [shortcutId, status, id, target]);
    }
    async shortcutFailed(id: number, target: number, conn: PoolConnection) {
        await conn.query("UPDATE MilestoneContractLinks SET ShortcutStatus = 'FAILED' WHERE MilestoneId = ? AND ContractId = ?", [id, target]);
    }
    async beginDetach(id: number, target: number, operationId: string, conn: PoolConnection) {
        await conn.query("UPDATE MilestoneContractLinks SET OperationId = ?, ShortcutStatus = 'PENDING' WHERE MilestoneId = ? AND ContractId = ?",
            [operationId, id, target]);
    }
    async detach(id: number, target: number, conn: PoolConnection) {
        await conn.query('DELETE FROM MilestoneContractLinks WHERE MilestoneId = ? AND ContractId = ?', [id, target]);
    }
    async contractLinks(ids: number[]) {
        return this.rows(`SELECT l.* FROM MilestoneContractLinks l JOIN Milestones m ON m.Id = l.MilestoneId
            WHERE l.ContractId IN (?) OR m.ContractId IN (?)`, [ids, ids]);
    }
    async moveGroup(id: number) {
        return this.rows(`SELECT c.* FROM Contracts c WHERE c.Id = ? OR c.OurIdRelated =
            (SELECT OurId FROM OurContractsData WHERE Id = ?) ORDER BY c.Id`, [id, id]);
    }
    async trackedIds(ids: number[]) {
        if (!ids.length) return [];
        return this.rows('SELECT MilestoneId FROM MilestoneSharingState WHERE MilestoneId IN (?) UNION SELECT MilestoneId FROM MilestoneContractLinks WHERE MilestoneId IN (?)', [ids, ids]);
    }
    async sharedType(id: number) {
        return this.rows('SELECT l.MilestoneId FROM MilestoneContractLinks l JOIN Milestones m ON m.Id=l.MilestoneId WHERE m.TypeId=? LIMIT 1', [id]);
    }
    async type(id: number) {
        return (await this.rows('SELECT * FROM MilestoneTypes WHERE Id = ?', [id]))[0];
    }
    async date(id: number) {
        return (await this.rows('SELECT * FROM MilestoneDates WHERE Id = ?', [id]))[0];
    }
}
