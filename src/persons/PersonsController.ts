import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import Person from './Person';
import Entity from '../entities/Entity';
import { UserData } from '../setup/GAuth2/sessionTypes';

type PersonsSearchParams = {
    projectId?: string;
    contractId?: number;
    systemRoleName?: string;
    systemEmail?: string;
    id?: number;
    showPrivateData?: boolean;
    _entities?: Entity[];
    searchText?: string;
};

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
            WHERE ${ToolsDb.makeOrGroupsConditions(
                orConditions,
                this.makeAndConditions.bind(this)
            )}
            GROUP BY Persons.Id
            ORDER BY Persons.Surname, Persons.Name;`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processPersonsResult(result);
    }

    static makeAndConditions(searchParams: PersonsSearchParams) {
        const conditions = [];

        if (searchParams.projectId) {
            conditions.push(
                mysql.format(`Roles.ProjectOurId=?`, [searchParams.projectId])
            );
        }

        if (searchParams.contractId) {
            conditions.push(
                mysql.format(
                    `(Roles.ContractId=(SELECT ProjectOurId FROM Contracts WHERE Contracts.Id=?) OR Roles.ContractId IS NULL)`,
                    [searchParams.contractId]
                )
            );
        }

        if (searchParams.systemRoleName) {
            conditions.push(
                mysql.format(`SystemRoles.Name REGEXP ?`, [
                    searchParams.systemRoleName,
                ])
            );
        }

        if (searchParams.systemEmail) {
            conditions.push(
                mysql.format(`Persons.systemEmail=?`, [
                    searchParams.systemEmail,
                ])
            );
        }

        if (searchParams.id) {
            conditions.push(mysql.format(`Persons.Id=?`, [searchParams.id]));
        }

        const entityCondition = ToolsDb.makeOrConditionFromValueOrArray1(
            searchParams._entities,
            'Persons',
            'EntityId',
            'id'
        );
        if (entityCondition !== '1') {
            conditions.push(entityCondition);
        }

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }

        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        if (searchText) searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(Persons.Name LIKE ?
                OR Persons.Surname LIKE ?
                OR Persons.Comment LIKE ?
                OR Persons.Position LIKE ?)`,
                [`%${word}%`, `%${word}%`, `%${word}%`, `%${word}%`]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static async getPersonFromSessionUserData(userData: UserData) {
        const person = (
            await PersonsController.getPersonsList([{ id: userData.enviId }])
        )[0];
        if (!person) throw new Error('No person found');
        return person;
    }
    static async getPersonBySystemEmail(systemEmail: string) {
        return (
            await this.getPersonsList([
                { systemEmail: systemEmail, showPrivateData: true },
            ])
        )[0];
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
                    name: row.EntityName,
                },
            });
            newResult.push(item);
        }
        return newResult;
    }
}
