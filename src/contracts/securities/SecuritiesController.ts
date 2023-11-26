import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb'
import ContractType from "../contractTypes/ContractType";
import Project from '../../projects/Project';
import ContractOur from '../ContractOur';
import { Security } from './Security';
import Person from '../../persons/Person';
import Case from '../milestones/cases/Case';

export type SecuritiesSearchParams = {
    id?: number,
    projectId?: string,
    _parent?: Project,
    searchText?: string,
    contractOurId?: string,
    startDateFrom?: string,
    startDateTo?: string,
    firstPartExpiryDateFrom?: string,
    firstPartExpiryDateTo?: string,
    secondPartExpiryDateFrom?: string,
    secondPartExpiryDateTo?: string,
    status?: string,
    contractName?: string,
    contractAlias?: string,
    typeId?: number,
    _contractType?: ContractType
}

export default class SecuritiesController {
    /**
     * Pobiera listę papierów wartościowych na podstawie podanych kryteriów wyszukiwania.
     * @param {SecuritiesSearchParams} searchParams - Główne kryteria wyszukiwania, gdzie wszystkie warunki są połączone operatorem AND.
     * @param {SecuritiesSearchParams[]} [orConditions] - Opcjonalna tablica dodatkowych kryteriów wyszukiwania. Każdy obiekt w tablicy reprezentuje zestaw warunków połączonych operatorem AND. Cała tablica jest łączona operatorem OR.
     * @example
     * // Pobierz papiery wartościowe o ID równym 1 lub 2.
     * const result = await SecuritiesController.getSecuritiesList({}, [{id: 1}, {id: 2}]);
     * 
     * // Pobierz papiery wartościowe o statusie 'active' dla projektu o ID 'A' lub statusie 'inactive' dla projektu o ID 'B'.
     * const result = await SecuritiesController.getSecuritiesList({projectId: "A"}, [{status: "active"}, {projectId: "B", status: "inactive"}]);
     */
    static async getSecuritiesList(orConditions: SecuritiesSearchParams[]) {

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
                WHERE ${ToolsDb.makeOrGroupsConditions(orConditions, this.makeAndConditions.bind(this))}
                ORDER BY ContractEndDate DESC`;
        console.log(sql);
        try {
            const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
            return this.processResult(result);
        } catch (err) {
            console.log(sql);
            throw (err);
        }
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1'
        if (searchText) searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map(word =>
            mysql.format(
                `(Securities.Description Like ?
        OR Contracts.Name LIKE ?
        OR Contracts.Number LIKE ?
        OR Contracts.Alias LIKE ?
        OR OurContractsData.OurId LIKE ?)`,
                [`%${word}%`, `%${word}%`, `%${word}%`, `%${word}%`, `%${word}%`]
            ));
        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static makeAndConditions(searchParams: SecuritiesSearchParams) {
        const projectOurId = searchParams._parent?.ourId || searchParams.projectId;
        const typeId = searchParams._contractType?.id || searchParams.typeId;

        const idCondition = searchParams.id
            ? mysql.format(`Contracts.Id = ? `, [searchParams.id])
            : '1';
        const projectCondition = projectOurId
            ? mysql.format(`Contracts.ProjectOurId = ? `, [projectOurId])
            : '1';
        const contractOurIdCondition = searchParams.contractOurId
            ? mysql.format(`OurContractsData.OurId LIKE ? `, [`%${searchParams.contractOurId}%`])
            : '1';
        const contractNameCondition = searchParams.contractName
            ? mysql.format(`Contracts.Name = ? `, [searchParams.contractName])
            : '1';
        const startDateFromCondition = searchParams.startDateFrom
            ? mysql.format(`Contracts.StartDate >= ? `, [searchParams.startDateFrom])
            : '1';
        const startDateToCondition = searchParams.startDateTo
            ? mysql.format(`Contracts.StartDate <= ? `, [searchParams.startDateTo])
            : '1';
        const statusCondition = ToolsDb.makeOrConditionFromValueOrArray(searchParams.status, 'Securities', 'Status');

        searchParams.status
            ? mysql.format(`Securities.Status = ? `, [searchParams.status])
            : '1';

        const firstPartExpiryDateFromCondition = searchParams.firstPartExpiryDateFrom
            ? mysql.format(`COALESCE(Securities.FirstPartExpiryDate, Contracts.EndDate) >= ? `, [searchParams.firstPartExpiryDateFrom])
            : '1';
        const firstPartExpiryDateToCondition = searchParams.firstPartExpiryDateTo
            ? mysql.format(`COALESCE(Securities.FirstPartExpiryDate, Contracts.EndDate) <= ? `, [searchParams.firstPartExpiryDateTo])
            : '1';

        const secondPartExpiryDateFromCondition = searchParams.secondPartExpiryDateFrom
            ? mysql.format(`Securities.SecondPartExpiryDate >= ? `, [searchParams.secondPartExpiryDateFrom])
            : '1';
        const secondPartExpiryDateToCondition = searchParams.secondPartExpiryDateTo
            ? mysql.format(`Securities.SecondPartExpiryDate <= ? `, [searchParams.secondPartExpiryDateTo])
            : '1';

        const contractTypeCondition = typeId
            ? mysql.format(`Contracts.TypeId = ? `, [typeId])
            : '1';

        const searchTextCondition = this.makeSearchTextCondition(searchParams.searchText);

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

    private static async processResult(result: any[]) {
        const newResult: Security[] = [];

        for (const row of result) {
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
                    }
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
                        isOur: row.ContractTypeIsOur
                    },
                    _admin: new Person({
                        id: row.AdminsId,
                        name: row.EditorsName,
                        surname: row.EditorsSurname,
                        email: row.EditorsEmail
                    })
                }),
                _editor: new Person({
                    name: row.EditorsName,
                    surname: row.EditorsSurname,
                    email: row.EditorsEmail
                })
            });
            item.setGdFolderUrl();
            newResult.push(item);
        }
        return newResult;
    }
}