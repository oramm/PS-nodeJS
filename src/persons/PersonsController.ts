import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb'
import Person from "./Person";
import Entity from '../entities/Entity';

type PersonsSearchParams = {
    projectId?: string,
    contractId?: number,
    systemRoleName?: string,
    systemEmail?: string,
    id?: number,
    showPrivateData?: boolean
    _entities?: Entity[],
    searchText?: string
}

export default class PersonsController {
    static async getPersonsList(orConditions: PersonsSearchParams[] = []) {

        const sql = `SELECT  Persons.Id,
                Persons.EntityId,
                Persons.Name,
                Persons.Surname,
                Persons.Position,
                Persons.Email,
                Persons.Cellphone,
                Persons.Phone,
                Persons.Comment,
                SystemRoles.Name AS SystemRoleName,
                Entities.Name AS EntityName
            FROM Persons
            JOIN Entities ON Persons.EntityId=Entities.Id
            LEFT JOIN Roles ON Roles.PersonId = Persons.Id
            JOIN SystemRoles ON Persons.SystemRoleId=SystemRoles.Id
            WHERE ${ToolsDb.makeOrGroupsConditions(orConditions, this.makeAndConditions.bind(this))}
            GROUP BY Persons.Id
            ORDER BY Persons.Surname, Persons.Name;`

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processPersonsResult(result);
    }

    static makeAndConditions(searchParams: PersonsSearchParams) {
        const projectCondition = searchParams.projectId
            ? mysql.format(`Roles.ProjectOurId=?`, [searchParams.projectId])
            : '1';

        let contractCondition;
        if (searchParams.contractId) {
            contractCondition = mysql.format(
                `(Roles.ContractId=(SELECT ProjectOurId FROM Contracts WHERE Contracts.Id=?) OR Roles.ContractId IS NULL)`,
                [searchParams.contractId]
            );
        } else {
            contractCondition = '1';
        }

        const systemRoleCondition = searchParams.systemRoleName
            ? mysql.format(`SystemRoles.Name REGEXP ?`, [searchParams.systemRoleName])
            : '1';

        const systemEmailCondition = searchParams.systemEmail
            ? mysql.format(`Persons.systemEmail=?`, [searchParams.systemEmail])
            : '1';

        const idCondition = searchParams.id
            ? mysql.format(`Persons.Id=?`, [searchParams.id])
            : '1';

        const entityCondition = ToolsDb.makeOrConditionFromValueOrArray1(searchParams._entities, 'Persons', 'EntityId', 'id');
        const searchTextCondition = this.makeSearchTextCondition(searchParams.searchText);

        const conditions = `${projectCondition} 
            AND ${contractCondition} 
            AND ${systemRoleCondition} 
            AND ${idCondition} 
            AND ${systemEmailCondition}
            AND ${entityCondition}
            AND ${searchTextCondition}`;

        return conditions;
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1'
        if (searchText) searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map(word =>
            mysql.format(`(Persons.Name LIKE ?
                OR Persons.Surname LIKE ?
                OR Persons.Comment LIKE ?
                OR Persons.Position LIKE ?)`,
                [`%${word}%`, `%${word}%`, `%${word}%`, `%${word}%`]));

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static async getPersonBySystemEmail(systemEmail: string) {
        return (await this.getPersonsList([{ systemEmail: systemEmail, showPrivateData: true }]))[0];
    }

    static processPersonsResult(result: any[]): Person[] {
        const newResult: Person[] = [];

        for (const row of result) {
            const item = new Person({
                id: row.Id,
                name: row.Name,
                surname: row.Surname,
                position: row.Position,
                email: row.Email,
                cellphone: row.Cellphone,
                phone: row.Phone,
                comment: row.Comment,
                systemRoleName: row.SystemRoleName,
                _entity: {
                    id: row.EntityId,
                    name: row.EntityName
                }
            });
            newResult.push(item);
        }
        return newResult;
    }
}