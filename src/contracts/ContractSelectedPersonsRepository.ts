import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import { PersonData } from '../types/types';
import { PROJECT_SCOPED_ROLES } from '../setup/Sessions/projectScopedPolicy';

export default class ContractSelectedPersonsRepository {
    static async validate(personIds: number[]): Promise<void> {
        if (!personIds.length) return;
        const external = await ToolsDb.getQueryCallbackAsync(
            `SELECT pa.PersonId FROM PersonAccounts pa
             JOIN SystemRoles sr ON sr.Id = pa.SystemRoleId
             WHERE pa.PersonId IN (?) AND sr.Name IN (?) LIMIT 1`,
            undefined, [personIds, PROJECT_SCOPED_ROLES],
        ) as { PersonId: number }[];
        if (external.length)
            throw Object.assign(new Error('Dodatkowe osoby przy kontrakcie nie mogą mieć roli pracownika wykonawcy ani klienta.'), { status: 400 });
    }

    static async find(contractId: number): Promise<PersonData[]> {
        return await ToolsDb.getQueryCallbackAsync(
            `SELECT p.Id AS id, p.Name AS name, p.Surname AS surname, p.Email AS email,
                CONCAT_WS(' ', p.Name, p.Surname, p.Email) AS _nameSurnameEmail
             FROM ContractSelectedPersons sp JOIN Persons p ON p.Id = sp.PersonId
             WHERE sp.ContractId = ? ORDER BY p.Surname, p.Name, p.Id`, undefined, [contractId],
        ) as PersonData[];
    }

    static async replace(contractId: number, personIds: number[], conn: mysql.PoolConnection): Promise<void> {
        await ToolsDb.executeSQL('DELETE FROM ContractSelectedPersons WHERE ContractId = ?', [contractId], conn);
        await this.add(contractId, personIds, conn);
    }

    static async add(contractId: number, personIds: number[], conn: mysql.PoolConnection): Promise<void> {
        for (const personId of personIds)
            await ToolsDb.executeSQL('INSERT INTO ContractSelectedPersons (ContractId, PersonId) VALUES (?, ?)',
                [contractId, personId], conn);
    }
}
