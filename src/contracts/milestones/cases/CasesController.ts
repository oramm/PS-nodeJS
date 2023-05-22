import mysql from 'mysql2/promise';
import Tools from "../../../tools/Tools";
import ToolsDb from '../../../tools/ToolsDb'
import Contract from "../../Contract";
import Case from "./Case";
import ProcesesController from '../../../processes/ProcesesController'
import ProcessInstancesController from "../../../processes/processInstances/ProcessInstancesController";
import Risk from "./risks/Risk";
import Milestone from "../Milestone";
import ContractOur from "../../ContractOur";
import ContractOther from "../../ContractOther";

export type CasesSearchParams = {
    projectId?: string,
    contractId?: number,
    milestoneId?: number,
    caseId?: number,
    searchText?: string
}

export default class CasesController {
    static async getCasesList(searchParams: CasesSearchParams = {}) {
        const projectCondition = (searchParams.projectId) ? 'Contracts.ProjectOurId="' + searchParams.projectId + '"' : '1';
        const contractCondition = (searchParams.contractId) ? 'Contracts.Id=' + searchParams.contractId : '1';
        const milestoneCondition = (searchParams.milestoneId) ? 'Cases.MilestoneId=' + searchParams.milestoneId : '1';
        const caseCondition = (searchParams.caseId) ? 'Cases.Id=' + searchParams.caseId : '1';
        const searchTextCondition = (searchParams.searchText) ?
            `(Cases.Name LIKE "%${searchParams.searchText}%" 
                OR Cases.Number LIKE "%${searchParams.searchText}%"
                OR Cases.Description LIKE "%${searchParams.searchText}%"
                OR CaseTypes.FolderNumber LIKE "%${searchParams.searchText}%"
                OR Milestones.Name LIKE "%${searchParams.searchText}%"
                OR CaseTypes.Name LIKE "%${searchParams.searchText}%"
             )`
            : '1';

        const sql = `SELECT 
                        Cases.Id,
                        CaseTypes.Id AS CaseTypeId,
                        CaseTypes.Name AS CaseTypeName,
                        CaseTypes.IsDefault,
                        CaseTypes.IsUniquePerMilestone,
                        CaseTypes.MilestoneTypeId,
                        CaseTypes.FolderNumber AS CaseTypeFolderNumber,
                        Cases.Name,
                        Cases.Number,
                        Cases.Description,
                        Cases.GdFolderId,
                        Cases.LastUpdated,
                        Milestones.Id AS MilestoneId,
                        Milestones.ContractId,
                        Milestones.Name AS MilestoneName,
                        Milestones.GdFolderId AS MilestoneGdFolderId,
                        MilestoneTypes.Id AS MilestoneTypeId,
                        MilestoneTypes.Name AS MilestoneTypeName,
                        MilestoneTypes_ContractTypes.FolderNumber AS MilestoneTypeFolderNumber,
                        OurContractsData.OurId AS ContractOurId,
                        Contracts.Alias AS ContractAlias,
                        Contracts.Number AS ContractNumber,
                        Contracts.Name AS ContractName,
                        Risks.Id AS RiskId,
                        Risks.Probability AS RiskProbability,
                        Risks.OverallImpact AS RiskOverallImpact
                    FROM Cases
                    LEFT JOIN CaseTypes ON Cases.TypeId=CaseTypes.Id
                    JOIN Milestones ON Milestones.Id=Cases.MilestoneId
                    JOIN MilestoneTypes ON Milestones.TypeId=MilestoneTypes.Id
                    JOIN Contracts ON Milestones.ContractId=Contracts.Id
                    LEFT JOIN OurContractsData ON OurContractsData.Id=Contracts.Id
                    LEFT JOIN Risks ON Risks.CaseId=Cases.Id
                    JOIN MilestoneTypes_ContractTypes ON MilestoneTypes_ContractTypes.MilestoneTypeId=Milestones.TypeId AND MilestoneTypes_ContractTypes.ContractTypeId=Contracts.TypeId
                    WHERE ${projectCondition} 
                      AND ${contractCondition} 
                      AND ${milestoneCondition} 
                      AND ${caseCondition}
                      AND ${searchTextCondition}
                    ORDER BY Contracts.Id, Milestones.Id, CaseTypes.FolderNumber`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processCasesResult(result, searchParams);
    }

    static async processCasesResult(result: any[], initParamObject: { projectId?: string, contractId?: number, milestoneId?: number }) {
        let newResult: Case[] = [];

        let [processes, processesInstances] = await Promise.all([
            ProcesesController.getProcessesList(initParamObject),
            ProcessInstancesController.getProcessInstancesList(initParamObject)
        ]);
        for (const row of result) {
            const contractInitParams = {
                ourId: row.ContractOurId,
                number: row.ContractNumber,
                alias: row.ContractAlias,
                name: ToolsDb.sqlToString(row.ContractName),
            }
            const _contract = contractInitParams.ourId ? new ContractOur(contractInitParams) : new ContractOther(contractInitParams);

            const item = new Case({
                id: row.Id,
                _type: {
                    id: row.CaseTypeId,
                    name: row.CaseTypeName,
                    isDefault: row.IsDefault,
                    isUniquePerMilestone: row.isUniquePerMilestone,
                    milestoneTypeId: row.MilestoneTypeId,
                    folderNumber: row.CaseTypeFolderNumber,
                    _processes: processes.filter((item: any) => item._caseType.id == row.CaseTypeId)
                },
                name: ToolsDb.sqlToString(row.Name),
                number: row.Number,
                description: ToolsDb.sqlToString(row.Description),
                gdFolderId: row.GdFolderId,
                lastUpdated: row.LastUpdated,
                _parent: new Milestone({
                    id: row.MilestoneId,
                    contractId: row.ContractId,
                    gdFolderId: row.MilestoneGdFolderId,
                    name: row.MilestoneName,
                    _type: {
                        id: row.MilestoneTypeId,
                        name: row.MilestoneTypeName,
                        _folderNumber: row.MilestoneTypeFolderNumber,
                    },
                    _parent: _contract
                }),
                _risk: new Risk({
                    id: row.RiskId,
                    probability: row.RiskProbability,
                    overallImpact: row.RiskOverallImpact
                }),
                _processesInstances: processesInstances.filter((item: any) => item._case.id == row.Id)
            });
            if (this.checkCriteria(item, initParamObject))
                newResult.push(item);
        }
        return newResult;
    }
    private static checkCriteria(caseItem: Case, criteria: any) {
        if (criteria.hasProcesses === undefined)
            return true;
        let hasProcesses: boolean = criteria.hasProcesses === 'true';
        return (caseItem._processesInstances && (hasProcesses === caseItem._processesInstances?.length > 0));
    }

    static makeSearchTextCondition(searchText: string) {
        if (!searchText) return '1'

        const words = searchText.split(' ');
        const conditions = words.map(word =>
            mysql.format(`(Cases.Number LIKE ? 
                            OR Cases.Name LIKE ?
                            OR Cases.Description LIKE ?
                            OR CaseTypes.FolderNumber LIKE ?
                            OR Milestones.Name LIKE ?
                            OR CaseTypes.Name LIKE ?)`,
                [`%${word}%`, `%${word}%`, `%${word}%`, `%${word}%`, `%${word}%`, `%${word}%`]));

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }
}