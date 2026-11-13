import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';

export default class ContractSelectedPersonsRepository {
    static async add(contractId: number, personIds: number[], conn: mysql.PoolConnection): Promise<void> {
        for (const personId of personIds)
            await ToolsDb.executeSQL('INSERT INTO ContractSelectedPersons (ContractId, PersonId) VALUES (?, ?)',
                [contractId, personId], conn);
    }
}
