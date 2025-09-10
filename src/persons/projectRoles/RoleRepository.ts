import BaseRepository from '../../repositories/BaseRepository';
import {
    ContractTypeData,
    OtherContractData,
    OurContractData,
    ProjectData,
    ProjectRoleData,
    ContractRoleData,
    PersonData,
    ContractRangePerContractData,
} from '../../types/types';
import Person from '../Person';
import ContractRole from './ContractRole';
import ProjectRole from './ProjectRole';
import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb';

export interface RolesSearchParams {
    searchText?: string;
    projectOurId?: string;
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
    _person?: PersonData;
    _contractRangesPerContract?: ContractRangePerContractData[];
    groupName?: string;
};

export default class RoleRepository extends BaseRepository<ContractRole> {
    constructor() {
        super('Roles');
    }

    protected mapRowToEntity(row: any): ContractRole {
       return new ContractRole({
            id: row.Id,
            name: row.Name,
            description: row.Description,
            groupName: row.GroupName,
            personId: row.PersonId,
            contractId: row.ContractId,
        });
    }

    async find(orConditions: RolesSearchParams[] = []): Promise<(ProjectRole | ContractRole)[]> {
        const conditions =
            orConditions.length > 0
                ? ToolsDb.makeOrGroupsConditions(
                      orConditions,
                      this.makeAndConditions.bind(this)
                  )
                : '1';
        
        const sql = `SELECT 
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
                Projects.OurId AS ProjectOurId,
                Projects.Alias AS ProjectAlias,
                Projects.Name AS ProjectName,
                SystemRoles.Name AS SystemRoleName,
                GROUP_CONCAT(ContractRanges.Name SEPARATOR ', ') AS RangeNames
            FROM Roles 
            JOIN Persons ON Persons.Id = Roles.PersonId 
            JOIN Entities ON Entities.Id = Persons.EntityId 
            JOIN SystemRoles ON SystemRoles.Id = Persons.SystemRoleId 
            LEFT JOIN Contracts ON Contracts.Id = Roles.ContractId
            LEFT JOIN OurContractsData ON Contracts.Id = OurContractsData.Id
            LEFT JOIN ContractTypes ON Contracts.TypeId = ContractTypes.Id
            LEFT JOIN Projects ON Projects.OurId = Roles.ProjectOurId
            LEFT JOIN ContractRangesContracts ON Contracts.Id = ContractRangesContracts.ContractId
            LEFT JOIN ContractRanges ON ContractRangesContracts.ContractRangeId = ContractRanges.Id
            WHERE ${conditions}
            GROUP BY Roles.Id
            ORDER BY Roles.Name ASC`;

        const rows = await this.executeQuery(sql);
        const result: (ContractRole | ProjectRole)[] = [];

        for (const row of rows) {
            const roleItem = row.ProjectOurId
                ? new ProjectRole(this.makeProjectRoleInitParams(row))
                : new ContractRole(this.makeContractRoleInitParams(row));
            result.push(roleItem);
        }
        return result;
    }
    
    private makeAndConditions(searchParams: RolesSearchParams) {
        const conditions: string[] = [];
        const projectOurId =
            searchParams._project?.ourId || searchParams.projectOurId;
        const contractId =
            searchParams._contract?.id || searchParams.contractId;

        if (projectOurId) {
            conditions.push(
                `Roles.ProjectOurId = ${mysql.escape(projectOurId)}`
            );
        }
        if (contractId) {
            conditions.push(`
                    Roles.ContractId = ${mysql.escape(contractId)}
                    OR Roles.ProjectOurId = (
                        SELECT Projects.OurId 
                        FROM Contracts 
                        JOIN Projects ON Projects.OurId = Contracts.ProjectOurId 
                        WHERE Contracts.Id = ${mysql.escape(contractId)}
                    )`);
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
        if (searchParams._contractRangesPerContract?.length) {
            const contractRangesCondition =
                ToolsDb.makeOrConditionFromValueOrArray(
                    searchParams._contractRangesPerContract?.map(
                        (range) => range._contractRange.id
                    ),
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

    private makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        const words = searchText.toString().split(' ');
        const conditions = words.map(
            (word) =>
                `(Roles.Name LIKE ${mysql.escape(word)}
                    OR Persons.Name LIKE ${mysql.escape(word)}
                    OR Persons.Surname LIKE ${mysql.escape(word)}
                    OR Projects.Name LIKE ${mysql.escape(word)}
                    OR Contracts.Name LIKE ${mysql.escape(word)})`,
        );
        return conditions.join(' AND ');
    }

    private makeContractRoleInitParams(row: any): ContractRoleData {
        return {
            id: row.Id,
            name: row.Name,
            description: row.Description,
            groupName: row.GroupName,
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
            _contract: {
                id: row.ContractId,
                ourId: row.ContractOurId,
                number: row.ContractNumber,
                name: row.ContractName,
                alias: row.ContractAlias,
                startDate: row.ContractStartDate,
                endDate: row.ContractEndDate,
                _contractRangesNames:
                    (<string | undefined>row.RangeNames)
                        ?.split(',')
                        .map((name) => name.trim()) || [],
                _type: {
                    id: row.ContractTypeId,
                    name: row.ContractTypeName,
                },
            } as OurContractData | OtherContractData,
        };
    }

    private makeProjectRoleInitParams(row: any): ProjectRoleData {
        const roleData: ContractRoleData = this.makeContractRoleInitParams(row);
        return {
            ...roleData,
            _project: {
                ourId: row.ProjectOurId as string,
                alias: row.ProjectAlias,
                name: row.ProjectName,
            } as ProjectData,
        };
    }

}

