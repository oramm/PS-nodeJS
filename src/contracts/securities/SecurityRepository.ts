import BaseRepository from '../../repositories/BaseRepository';
import { Security, SecuritiesSearchParams } from './Security';
import ToolsDb from '../../tools/ToolsDb';
import Case from '../milestones/cases/Case';
import { MilestoneData } from '../../types/types';
import ContractOur from '../ContractOur';
import Person from '../../persons/Person';
import mysql from 'mysql2/promise';

export default class SecurityRepository extends BaseRepository<Security> {
    constructor() {
        super('Securities');
    }

    /**
     * Mapuje wiersz z bazy danych na obiekt Security
     */
    protected mapRowToModel(row: any): Security {
        const item = new Security({
            id: row.Id,
            description: ToolsDb.sqlToString(row.Description),
            value: row.Value,
            returnedValue: row.ReturnedValue,
            deductionValue: row.DeductionValue,
            firstPartRate: row.FirstPartRate,
            secondPartRate: row.SecondPartRate,
            firstPartExpiryDate: row.FirstPartExpiryDate,
            secondPartExpiryDate: row.SecondPartExpiryDate,
            isCash: row.IsCash,
            status: ToolsDb.sqlToString(row.Status),
            _lastUpdated: row.LastUpdated,
            _case: new Case({
                id: row.CaseId,
                name: row.CaseName,
                number: row.CaseNumber,
                description: row.CaseDescription,
                gdFolderId: row.CaseGdFolderId,
                _type: {
                    id: row.CaseTypeId,
                    name: row.CaseTypeName,
                    isDefault: row.IsDefault,
                    isUniquePerMilestone: row.isUniquePerMilestone,
                    milestoneTypeId: row.MilestoneTypeId,
                },
                _parent: {} as MilestoneData,
            }),
            _contract: new ContractOur({
                id: row.ContractId,
                ourId: row.ContractOurId,
                alias: row.ContractAlias,
                number: row.ContractNumber,
                startDate: row.ContractStartDate,
                endDate: row.ContractEndDate,
                guaranteeEndDate: row.ContractGuaranteeEndDate,
                name: row.ContractName,
                status: row.ContractStatus,
                _type: {
                    id: row.ContractTypeId,
                    name: row.ContractTypeName,
                    description: row.ContractTypeDescription,
                    isOur: row.ContractTypeIsOur,
                },
                _admin: new Person({
                    id: row.AdminsId,
                    name: row.EditorsName,
                    surname: row.EditorsSurname,
                    email: row.EditorsEmail,
                }),
            }),
            _editor: new Person({
                name: row.EditorsName,
                surname: row.EditorsSurname,
                email: row.EditorsEmail,
            }),
        });
        item.setGdFolderUrl();
        return item;
    }

    /**
     * Wyszukuje papiery wartościowe w bazie danych
     */
    async find(orConditions: SecuritiesSearchParams[]): Promise<Security[]> {
        const sql = `SELECT 
                    Securities.Id,
                    Securities.ContractId,
                    Securities.Description,
                    Securities.Value,
                    Securities.ReturnedValue,
                    Securities.DeductionValue,
                    Securities.FirstPartRate,
                    Securities.SecondPartRate,
                    Securities.FirstPartExpiryDate,
                    Securities.SecondPartExpiryDate,
                    Securities.IsCash,
                    Securities.Status,
                    Securities.LastUpdated,
                    Cases.Id AS CaseId,
                    Cases.Name AS CaseName,
                    Cases.Number AS CaseNumber,
                    Cases.Description AS CaseDescription,
                    Cases.GdFolderId AS CaseGdFolderId,
                    CaseTypes.Id AS CaseTypeId,
                    CaseTypes.Name AS CaseTypeName,
                    CaseTypes.IsDefault,
                    CaseTypes.IsUniquePerMilestone,
                    CaseTypes.MilestoneTypeId,
                    Contracts.Id AS ContractId,
                    Contracts.Alias AS ContractAlias, 
                    Contracts.Number AS ContractNumber, 
                    Contracts.Name AS ContractName, 
                    Contracts.StartDate AS ContractStartDate, 
                    Contracts.EndDate AS ContractEndDate,
                    Contracts.GuaranteeEndDate AS ContractGuaranteeEndDate,
                    Contracts.Status AS ContractStatus,
                    OurContractsData.OurId AS ContractOurId,
                    ContractTypes.Id AS MainContractTypeId, 
                    ContractTypes.Name AS TypeName, 
                    ContractTypes.IsOur AS TypeIsOur, 
                    ContractTypes.Description AS TypeDescription,
                    Admins.Id AS AdminsId,
                    Admins.Name AS EditorsName,
                    Admins.Surname AS EditorsSurname,
                    Admins.Email AS EditorsEmail,
                    Editors.Id AS EditorsId,
                    Editors.Name AS EditorsName,
                    Editors.Surname AS EditorsSurname,
                    Editors.Email AS EditorsEmail
                FROM Securities
                JOIN Contracts ON Contracts.Id=Securities.ContractId 
                JOIN OurContractsData ON OurContractsData.Id=ContractId 
                JOIN ContractTypes ON ContractTypes.Id = Contracts.TypeId
                JOIN Cases ON Cases.Id = CaseId
                JOIN CaseTypes ON CaseTypes.Id = Cases.TypeId
                LEFT JOIN Persons AS Editors ON Securities.EditorId = Editors.Id
                LEFT JOIN Persons AS Admins ON OurContractsData.AdminId = Admins.Id
                LEFT JOIN Persons AS Managers ON OurContractsData.ManagerId = Managers.Id
                WHERE ${ToolsDb.makeOrGroupsConditions(
                    orConditions,
                    this.makeAndConditions.bind(this)
                )}
                ORDER BY ContractEndDate DESC`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return result.map((row) => this.mapRowToModel(row));
    }

    private makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        if (searchText) searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(Securities.Description Like ?
                    OR Contracts.Name LIKE ?
                    OR Contracts.Number LIKE ?
                    OR Contracts.Alias LIKE ?
                    OR OurContractsData.OurId LIKE ?)`,
                [
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                ]
            )
        );
        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    private makeAndConditions(searchParams: SecuritiesSearchParams) {
        const projectOurId =
            searchParams._parent?.ourId || searchParams.projectId;
        const typeId = searchParams._contractType?.id || searchParams.typeId;

        const idCondition = searchParams.id
            ? mysql.format(`Contracts.Id = ? `, [searchParams.id])
            : '1';
        const projectCondition = projectOurId
            ? mysql.format(`Contracts.ProjectOurId = ? `, [projectOurId])
            : '1';
        const contractOurIdCondition = searchParams.contractOurId
            ? mysql.format(`OurContractsData.OurId LIKE ? `, [
                  `%${searchParams.contractOurId}%`,
              ])
            : '1';
        const contractNameCondition = searchParams.contractName
            ? mysql.format(`Contracts.Name = ? `, [searchParams.contractName])
            : '1';
        const startDateFromCondition = searchParams.startDateFrom
            ? mysql.format(`Contracts.StartDate >= ? `, [
                  searchParams.startDateFrom,
              ])
            : '1';
        const startDateToCondition = searchParams.startDateTo
            ? mysql.format(`Contracts.StartDate <= ? `, [
                  searchParams.startDateTo,
              ])
            : '1';
        const statusCondition = ToolsDb.makeOrConditionFromValueOrArray(
            searchParams.status,
            'Securities',
            'Status'
        );

        searchParams.status
            ? mysql.format(`Securities.Status = ? `, [searchParams.status])
            : '1';

        const firstPartExpiryDateFromCondition =
            searchParams.firstPartExpiryDateFrom
                ? mysql.format(
                      `COALESCE(Securities.FirstPartExpiryDate, Contracts.EndDate) >= ? `,
                      [searchParams.firstPartExpiryDateFrom]
                  )
                : '1';
        const firstPartExpiryDateToCondition =
            searchParams.firstPartExpiryDateTo
                ? mysql.format(
                      `COALESCE(Securities.FirstPartExpiryDate, Contracts.EndDate) <= ? `,
                      [searchParams.firstPartExpiryDateTo]
                  )
                : '1';

        const secondPartExpiryDateFromCondition =
            searchParams.secondPartExpiryDateFrom
                ? mysql.format(`Securities.SecondPartExpiryDate >= ? `, [
                      searchParams.secondPartExpiryDateFrom,
                  ])
                : '1';
        const secondPartExpiryDateToCondition =
            searchParams.secondPartExpiryDateTo
                ? mysql.format(`Securities.SecondPartExpiryDate <= ? `, [
                      searchParams.secondPartExpiryDateTo,
                  ])
                : '1';

        const contractTypeCondition = typeId
            ? mysql.format(`Contracts.TypeId = ? `, [typeId])
            : '1';

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );

        return `${idCondition} 
                AND ${projectCondition}  
                AND ${contractOurIdCondition} 
                AND ${contractNameCondition}
                AND ${startDateFromCondition}
                AND ${startDateToCondition}
                AND ${firstPartExpiryDateFromCondition}
                AND ${firstPartExpiryDateToCondition}
                AND ${secondPartExpiryDateFromCondition}
                AND ${secondPartExpiryDateToCondition}
                AND ${statusCondition}
                AND ${contractTypeCondition}
                AND ${searchTextCondition} `;
    }
}
