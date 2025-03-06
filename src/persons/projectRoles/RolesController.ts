import ToolsDb from '../../tools/ToolsDb';
import {
    OtherContractData,
    OurContractData,
    ProjectData,
} from '../../types/types';
import Person from '../Person';
import Role from './Role';
import mysql from 'mysql2/promise';

export type RolesSearchParams = {
    projectId?: string;
    personId?: number;
    groupName?: string;
};

export default class RolesController {
    static async getRolesList(
        orConditions: RolesSearchParams[] = []
    ): Promise<Role[]> {
        const sql = `
            SELECT 
                Roles.Id, 
                Roles.Name, 
                Roles.Description, 
                Roles.GroupName, 
                Persons.Id AS PersonId,
                Persons.Name AS PersonName, 
                Persons.Surname AS PersonSurName, 
                Persons.Email AS PersonEmail, 
                Persons.Cellphone AS PersonCellphone, 
                Persons.Phone AS PersonPhone, 
                Entities.Name AS EntityName, 
                Contracts.Id AS ContractId, 
                Contracts.Number AS ContractNumber, 
                OurContractsData.OurId AS ContractOurId,
                Projects.Id AS ProjectId,
                Projects.OurId AS ProjectOurId,
                SystemRoles.Name AS SystemRoleName
            FROM Roles 
            JOIN Persons ON Persons.Id = Roles.PersonId 
            JOIN Entities ON Entities.Id = Persons.EntityId 
            JOIN SystemRoles ON SystemRoles.Id = Persons.SystemRoleId 
            LEFT JOIN Contracts ON Contracts.Id = Roles.ContractId 
            LEFT JOIN Projects ON Projects.Id = Roles.ProjectId
            LEFT JOIN OurContractsData ON Contracts.Id = OurContractsData.Id 
            WHERE ${ToolsDb.makeOrGroupsConditions(
                orConditions,
                this.makeAndConditions.bind(this)
            )}
            ORDER BY Roles.Name ASC
        `;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processRolesResult(result);
    }

    static makeAndConditions(params: RolesSearchParams) {
        const conditions: string[] = [];

        if (params.projectId) {
            conditions.push(
                `Roles.ProjectOurId = ${mysql.escape(params.projectId)}`
            );
        }
        if (params.personId) {
            conditions.push(
                `Roles.PersonId = ${mysql.escape(params.personId)}`
            );
        }
        if (params.groupName) {
            conditions.push(
                `Roles.GroupName = ${mysql.escape(params.groupName)}`
            );
        }

        return conditions.length ? conditions.join(' AND ') : '1';
    }

    static processRolesResult(result: any[]): Role[] {
        const newResult: Role[] = [];

        for (const row of result) {
            const roleItem = new Role({
                id: row.Id,
                projectId: row.ProjectId,
                _project: {
                    id: row.ProjectId as number | undefined,
                    ourId: row.ProjectOurId as string,
                } as ProjectData,
                name: row.Name,
                description: row.Description,
                groupName: row.GroupName,
                managerId: row.ManagerId,
                // Wykorzystanie pola RoleType, jeśli masz je w modelu
                type: row.RoleType,
                personId: row.PersonId,
                _person: new Person({
                    id: row.PersonId,
                    name: row.PersonName?.trim(),
                    surname: row.PersonSurName?.trim(),
                    email: row.PersonEmail?.trim(),
                    cellphone: row.PersonCellphone,
                    phone: row.PersonPhone,
                    _entity: {
                        name:
                            row.SystemRoleName === 'ENVI_COOPERATOR'
                                ? 'ENVI'
                                : row.EntityName?.trim(),
                    },
                }),
                contractId: row.ContractId,
                _contract: {
                    id: row.ContractId,
                    ourId: row.ContractOurId,
                    number: row.ContractNumber,
                    name: row.ContractName,
                    alias: row.ContractAlias,
                } as OurContractData | OtherContractData,
            });

            newResult.push(roleItem);
        }
        return newResult;
    }
}
