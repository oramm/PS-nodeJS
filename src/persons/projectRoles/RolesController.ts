import ContractRange from '../../Admin/ContractRanges/ContractRange';
import ToolsDb from '../../tools/ToolsDb';
import {
    ContractTypeData,
    OtherContractData,
    OurContractData,
    ProjectData,
} from '../../types/types';
import Person from '../Person';
import Role from './Role';
import mysql from 'mysql2/promise';

export type RolesSearchParams = {
    searchText?: string;
    projectId?: string;
    _project?: ProjectData;
    _contract?: OurContractData | OtherContractData;
    contractId?: number;
    personId?: number;
    startDateFrom?: string;
    startDateTo?: string;
    endDateFrom?: string;
    endDateTo?: string;
    _contractType?: ContractTypeData;
    statuses?: string[];
    _person?: Person;
    _contractRanges?: ContractRange[];
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
                Contracts.Name AS ContractName,
                Contracts.Alias AS ContractAlias,
                Contracts.StartDate AS ContractStartDate,
                Contracts.EndDate AS ContractEndDate,
                OurContractsData.OurId AS ContractOurId,
                ContractTypes.Id AS ContractTypeId,
                ContractTypes.Name AS ContractTypeName,
                Projects.Id AS ProjectId,
                Projects.OurId AS ProjectOurId,
                Projects.Alias AS ProjectAlias,
                Projects.Name AS ProjectName,
                SystemRoles.Name AS SystemRoleName
            FROM Roles 
            JOIN Persons ON Persons.Id = Roles.PersonId 
            JOIN Entities ON Entities.Id = Persons.EntityId 
            JOIN SystemRoles ON SystemRoles.Id = Persons.SystemRoleId 
            LEFT JOIN Contracts ON Contracts.Id = Roles.ContractId
            LEFT JOIN OurContractsData ON Contracts.Id = OurContractsData.Id
            LEFT JOIN ContractTypes ON Contracts.TypeId = ContractTypes.Id
            LEFT JOIN Projects ON Projects.Id = Roles.ProjectId
            WHERE ${ToolsDb.makeOrGroupsConditions(
                orConditions,
                this.makeAndConditions.bind(this)
            )}
            ORDER BY Roles.Name ASC
        `;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processRolesResult(result);
    }

    static makeAndConditions(searchParams: RolesSearchParams) {
        const conditions: string[] = [];
        const projectId = searchParams._project?.id || searchParams.projectId;
        const contractId =
            searchParams._contract?.id || searchParams.contractId;

        if (projectId) {
            conditions.push(
                `Roles.ProjectOurId = ${mysql.escape(searchParams.projectId)}`
            );
        }
        if (contractId) {
            conditions.push(`Roles.ContractId = ${mysql.escape(contractId)}`);
        }
        if (searchParams.personId) {
            conditions.push(
                `Roles.PersonId = ${mysql.escape(searchParams.personId)}`
            );
        }
        if (searchParams.groupName) {
            conditions.push(
                `Roles.GroupName = ${mysql.escape(searchParams.groupName)}`
            );
        }

        if (searchParams.startDateFrom) {
            conditions.push(
                mysql.format(`Contracts.StartDate >= ?`, [
                    searchParams.startDateFrom,
                ])
            );
        }
        if (searchParams.startDateTo) {
            conditions.push(
                mysql.format(`Contracts.StartDate <= ?`, [
                    searchParams.startDateTo,
                ])
            );
        }
        if (searchParams.endDateFrom) {
            conditions.push(
                mysql.format(`Contracts.EndDate >= ?`, [
                    searchParams.endDateFrom,
                ])
            );
        }
        if (searchParams.endDateTo) {
            conditions.push(
                mysql.format(`Contracts.EndDate <= ?`, [searchParams.endDateTo])
            );
        }

        if (searchParams._contractType?.id) {
            conditions.push(
                mysql.format(`Contracts.TypeId = ?`, [
                    searchParams._contractType.id,
                ])
            );
        }

        if (searchParams.statuses?.length) {
            const statusCondition = ToolsDb.makeOrConditionFromValueOrArray(
                searchParams.statuses,
                'Contracts',
                'Status'
            );
            conditions.push(statusCondition);
        }

        if (searchParams._contractRanges?.length) {
            const contractRangesCondition =
                ToolsDb.makeOrConditionFromValueOrArray(
                    searchParams._contractRanges?.map((range) => range.id),
                    'ContractRangesContracts',
                    'ContractRangeId'
                );
            conditions.push(contractRangesCondition);
        }

        if (searchParams._person?.id) {
            conditions.push(
                `Roles.PersonId = ${mysql.escape(searchParams._person.id)}`
            );
        }

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }

        return conditions.length ? conditions.join(' AND ') : '1';
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(Roles.Name LIKE ?
                    OR Persons.Name LIKE ?
                    OR Persons.Surname LIKE ?
                    OR Projects.Name LIKE ?
                    OR Contracts.Name LIKE ?)`,
                Array(5).fill(`%${word}%`)
            )
        );
        return conditions.join(' AND ');
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
                    alias: row.ProjectAlias,
                    name: row.ProjectName,
                } as ProjectData,
                name: row.Name,
                description: row.Description,
                groupName: row.GroupName,
                managerId: row.ManagerId,
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
                    startDate: row.ContractStartDate,
                    endDate: row.ContractEndDate,
                    _type: {
                        id: row.ContractTypeId,
                        name: row.ContractTypeName,
                    },
                } as OurContractData | OtherContractData,
            });

            newResult.push(roleItem);
        }
        return newResult;
    }
}
