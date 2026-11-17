import type {PoolConnection,RowDataPacket} from 'mysql2/promise';
export default class ConsolidationGuidanceRepository {
    async milestones(ids:number[],conn:PoolConnection){return ids.length?(await conn.query<RowDataPacket[]>('SELECT Id, ContractId, OfferId FROM Milestones WHERE Id IN (?)',[ids]))[0]:[];}
    async offers(ids:number[],conn:PoolConnection){return ids.length?(await conn.query<RowDataPacket[]>('SELECT Id FROM Offers WHERE Id IN (?)',[ids]))[0]:[];}
}
