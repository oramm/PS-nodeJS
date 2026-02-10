import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import Person from './Person';
import { SystemRoleName } from '../types/sessionTypes';
import BaseRepository from '../repositories/BaseRepository';
import Entity from '../entities/Entity';

export interface PersonsSearchParams {
    projectId?: string;
    contractId?: number;
    systemRoleName?: string;
    systemEmail?: string;
    id?: number;
    showPrivateData?: boolean;
    _entities?: Entity[];
    searchText?: string;
}

export default class PersonRepository extends BaseRepository<Person> {
    constructor() {
        super('Persons');
    }

    private isV2ReadEnabled(): boolean {
        return (
            (process.env.PERSONS_MODEL_V2_READ_ENABLED || '').toLowerCase() ===
            'true'
        );
    }

    protected mapRowToModel(row: any): Person {
        return new Person({
            id: row.Id,
            name: row.Name,
            surname: row.Surname,
            position: row.Position,
            email: row.Email,
            cellphone: row.Cellphone,
            phone: row.Phone,
            comment: row.Comment,
            systemEmail: row.SystemEmail,
            systemRoleName: row.SystemRoleName,
            systemRoleId: row.SystemRoleId,
            _entity: { id: row.EntityId, name: row.EntityName },
        });
    }

    async find(orConditions: PersonsSearchParams[] = []): Promise<Person[]> {
        return this.findByReadFacade(orConditions);
    }

    async findByReadFacade(
        orConditions: PersonsSearchParams[] = []
    ): Promise<Person[]> {
        if (!this.isV2ReadEnabled()) {
            return this.findLegacy(orConditions);
        }

        try {
            return await this.findV2(orConditions);
        } catch (err) {
            console.warn(
                '[PersonsV2] find v2 read path failed, fallback to legacy path.',
                err
            );
            return this.findLegacy(orConditions);
        }
    }

    async getPersonBySystemEmailByReadFacade(
        systemEmail: string
    ): Promise<Person | undefined> {
        const people = await this.findByReadFacade([
            { systemEmail, showPrivateData: true },
        ]);
        return people[0];
    }

    async getPersonBySystemEmail(
        systemEmail: string
    ): Promise<Person | undefined> {
        return this.getPersonBySystemEmailByReadFacade(systemEmail);
    }

    private async findLegacy(
        orConditions: PersonsSearchParams[] = []
    ): Promise<Person[]> {
        const conditions =
            orConditions.length > 0
                ? this.makeOrGroupsConditions(
                      orConditions,
                      (searchParams) =>
                          this.makeAndConditions(searchParams, 'legacy')
                  )
                : '1';

        const sql = `SELECT Persons.Id, 
                            Persons.EntityId, 
                            Persons.Name, 
                            Persons.Surname, 
                            Persons.Position, 
                            Persons.Email, 
                            Persons.Cellphone, 
                            Persons.Phone, 
                            Persons.Comment, 
                            Persons.SystemEmail,
                            SystemRoles.Name AS SystemRoleName,
                            SystemRoles.Id AS SystemRoleId,
                            Entities.Name AS EntityName
                    FROM Persons
                    JOIN Entities ON Persons.EntityId=Entities.Id
                    LEFT JOIN Roles ON Roles.PersonId = Persons.Id
                    JOIN SystemRoles ON Persons.SystemRoleId=SystemRoles.Id
                    WHERE ${conditions}
                    GROUP BY Persons.Id
                    ORDER BY Persons.Surname, Persons.Name ASC`;

        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToModel(row));
    }

    private async findV2(
        orConditions: PersonsSearchParams[] = []
    ): Promise<Person[]> {
        const conditions =
            orConditions.length > 0
                ? this.makeOrGroupsConditions(
                      orConditions,
                      (searchParams) =>
                          this.makeAndConditions(searchParams, 'v2')
                  )
                : '1';

        const sql = `SELECT Persons.Id, 
                            Persons.EntityId, 
                            Persons.Name, 
                            Persons.Surname, 
                            Persons.Position, 
                            Persons.Email, 
                            Persons.Cellphone, 
                            Persons.Phone, 
                            Persons.Comment, 
                            COALESCE(PersonAccounts.SystemEmail, Persons.SystemEmail) AS SystemEmail,
                            COALESCE(V2SystemRoles.Name, LegacySystemRoles.Name) AS SystemRoleName,
                            COALESCE(PersonAccounts.SystemRoleId, Persons.SystemRoleId) AS SystemRoleId,
                            Entities.Name AS EntityName
                    FROM Persons
                    JOIN Entities ON Persons.EntityId=Entities.Id
                    LEFT JOIN Roles ON Roles.PersonId = Persons.Id
                    LEFT JOIN PersonAccounts ON PersonAccounts.PersonId = Persons.Id AND PersonAccounts.IsActive = 1
                    LEFT JOIN SystemRoles V2SystemRoles ON PersonAccounts.SystemRoleId = V2SystemRoles.Id
                    JOIN SystemRoles LegacySystemRoles ON Persons.SystemRoleId = LegacySystemRoles.Id
                    WHERE ${conditions}
                    GROUP BY Persons.Id
                    ORDER BY Persons.Surname, Persons.Name ASC`;

        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToModel(row));
    }

    async getSystemRole(params: { id?: number; systemEmail?: string }) {
        return this.getSystemRoleByReadFacade(params);
    }

    async getSystemRoleByReadFacade(params: { id?: number; systemEmail?: string }) {
        if (!this.isV2ReadEnabled()) {
            return this.getSystemRoleLegacy(params);
        }

        try {
            const systemRole = await this.getSystemRoleV2(params);
            if (systemRole) return systemRole;
            return this.getSystemRoleLegacy(params);
        } catch (err) {
            console.warn(
                '[PersonsV2] getSystemRole v2 read path failed, fallback to legacy path.',
                err
            );
            return this.getSystemRoleLegacy(params);
        }
    }

    private async getSystemRoleLegacy(params: {
        id?: number;
        systemEmail?: string;
    }) {
        if (!params.id && !params.systemEmail)
            throw new Error('Person should have an ID or systemEmail');
        const personIdCondition = params.id
            ? mysql.format('Persons.Id = ?', [params.id])
            : '1';

        const systemEmailCondition = params.systemEmail
            ? mysql.format('Persons.SystemEmail = ?', [params.systemEmail])
            : '1';

        const sql =
            'SELECT \n \t' +
            'Persons.SystemRoleId, \n \t ' +
            'Persons.Id AS PersonId, \n \t ' +
            'Persons.GoogleId AS GoogleId, \n \t ' +
            'Persons.GoogleRefreshToken AS GoogleRefreshToken, \n \t ' +
            'SystemRoles.Name AS SystemRoleName \n' +
            'FROM Persons \n ' +
            'JOIN SystemRoles ON Persons.SystemRoleId=SystemRoles.Id \n' +
            'WHERE ' +
            systemEmailCondition +
            ' AND ' +
            personIdCondition;

        try {
            const result: any[] = <any[]>(
                await ToolsDb.getQueryCallbackAsync(sql)
            );
            const row = result[0];
            if (!row) return undefined;
            return {
                id: <number>row.SystemRoleId,
                name: <SystemRoleName>row.SystemRoleName,
                personId: <number>row.PersonId,
                googleId: <string | undefined>row.GoogleId,
                microsofId: <string | undefined>row.MicrosoftId,
                googleRefreshToken: <string | undefined>row.GoogleRefreshToken,
            };
        } catch (err) {
            throw err;
        }
    }

    private async getSystemRoleV2(params: {
        id?: number;
        systemEmail?: string;
    }) {
        if (!params.id && !params.systemEmail)
            throw new Error('Person should have an ID or systemEmail');

        const personIdCondition = params.id
            ? mysql.format('Persons.Id = ?', [params.id])
            : '1';

        const systemEmailCondition = params.systemEmail
            ? mysql.format(
                  'COALESCE(PersonAccounts.SystemEmail, Persons.SystemEmail) = ?',
                  [params.systemEmail]
              )
            : '1';

        const sql =
            'SELECT \n \t' +
            'COALESCE(PersonAccounts.SystemRoleId, Persons.SystemRoleId) AS SystemRoleId, \n \t ' +
            'Persons.Id AS PersonId, \n \t ' +
            'COALESCE(PersonAccounts.GoogleId, Persons.GoogleId) AS GoogleId, \n \t ' +
            'COALESCE(PersonAccounts.GoogleRefreshToken, Persons.GoogleRefreshToken) AS GoogleRefreshToken, \n \t ' +
            'PersonAccounts.MicrosoftId AS MicrosoftId, \n \t ' +
            'COALESCE(V2SystemRoles.Name, LegacySystemRoles.Name) AS SystemRoleName \n' +
            'FROM Persons \n ' +
            'LEFT JOIN PersonAccounts ON PersonAccounts.PersonId = Persons.Id AND PersonAccounts.IsActive = 1 \n' +
            'LEFT JOIN SystemRoles V2SystemRoles ON PersonAccounts.SystemRoleId = V2SystemRoles.Id \n' +
            'LEFT JOIN SystemRoles LegacySystemRoles ON Persons.SystemRoleId = LegacySystemRoles.Id \n' +
            'WHERE ' +
            systemEmailCondition +
            ' AND ' +
            personIdCondition;

        try {
            const result: any[] = <any[]>(
                await ToolsDb.getQueryCallbackAsync(sql)
            );
            const row = result[0];
            if (!row) return undefined;
            return {
                id: <number>row.SystemRoleId,
                name: <SystemRoleName>row.SystemRoleName,
                personId: <number>row.PersonId,
                googleId: <string | undefined>row.GoogleId,
                microsofId: <string | undefined>row.MicrosoftId,
                googleRefreshToken: <string | undefined>row.GoogleRefreshToken,
            };
        } catch (err) {
            throw err;
        }
    }

    private makeAndConditions(
        searchParams: PersonsSearchParams,
        readPath: 'legacy' | 'v2' = 'legacy'
    ): string {
        const conditions: string[] = [];
        const systemRoleNameColumn =
            readPath === 'v2'
                ? 'COALESCE(V2SystemRoles.Name, LegacySystemRoles.Name)'
                : 'SystemRoles.Name';
        const systemEmailColumn =
            readPath === 'v2'
                ? 'COALESCE(PersonAccounts.SystemEmail, Persons.SystemEmail)'
                : 'Persons.SystemEmail';

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
                mysql.format(`${systemRoleNameColumn} REGEXP ?`, [
                    searchParams.systemRoleName,
                ])
            );
        }

        if (searchParams.systemEmail) {
            conditions.push(
                mysql.format(`${systemEmailColumn}=?`, [
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

    private makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';

        const words = searchText.toString().split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(Persons.Name LIKE ${mysql.escape(`%${word}%`)}
                OR Persons.Surname LIKE ${mysql.escape(`%${word}%`)}
                OR Persons.Email LIKE ${mysql.escape(`%${word}%`)}
                OR Persons.Comment LIKE ${mysql.escape(`%${word}%`)}
                OR Persons.Position LIKE ${mysql.escape(`%${word}%`)})`
            )
        );
        return conditions.join(' AND ');
    }
}
