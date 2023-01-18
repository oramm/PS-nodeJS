import mysql from "mysql";
import Tools from "../../../tools/Tools";
import ToolsDb from '../../../tools/ToolsDb'
import Contract from "../../Contract";
import Case from "./Case";
import ProcesesController from '../../../processes/ProcesesController'
import ProcessInstancesController from "../../../processes/processInstances/ProcessInstancesController";
import Risk from "./risks/Risk";

export default class CasesController {
    static async getCasesList(initParamObject: {
        projectId?: string,
        contractId?: number,
        milestoneId?: number,
        caseId?: number,
    }) {
        const projectCondition = (initParamObject.projectId) ? 'Contracts.ProjectOurId="' + initParamObject.projectId + '"' : '1';
        const contractCondition = (initParamObject.contractId) ? 'Contracts.Id=' + initParamObject.contractId : '1';
        const milestoneCondition = (initParamObject.milestoneId) ? 'Cases.MilestoneId=' + initParamObject.milestoneId : '1';
        const caseCondition = (initParamObject.caseId) ? 'Cases.Id=' + initParamObject.caseId : '1';


        const sql = 'SELECT Cases.Id, \n \t' +
            'CaseTypes.Id AS CaseTypeId, \n \t' +
            'CaseTypes.Name AS CaseTypeName, \n \t' +
            'CaseTypes.IsDefault, \n \t' +
            'CaseTypes.IsUniquePerMilestone, \n \t' +
            'CaseTypes.MilestoneTypeId, \n \t' +
            'CaseTypes.FolderNumber AS CaseTypeFolderNumber, \n \t' +
            'Cases.Name, \n \t' +
            'Cases.Number, \n \t' +
            'Cases.Description, \n \t' +
            'Cases.GdFolderId, \n \t' +
            'Cases.LastUpdated, \n \t' +
            'Milestones.Id AS MilestoneId, \n \t' +
            'Milestones.ContractId, \n \t' +
            'Milestones.GdFolderId AS MilestoneGdFolderId, \n \t' +
            'MilestoneTypes.Id AS MilestoneTypeId, \n \t' +
            'MilestoneTypes.Name AS MilestoneTypeName, \n \t' +
            'MilestoneTypes_ContractTypes.FolderNumber AS MilestoneTypeFolderNumber, \n \t' +
            'OurContractsData.OurId AS ContractOurId, \n \t' +
            'Contracts.Alias AS ContractAlias, \n \t' +
            'Contracts.Number AS ContractNumber, \n \t' +
            'Contracts.Name AS ContractName, \n \t' +
            'Risks.Id AS RiskId, \n \t' +
            'Risks.Probability AS RiskProbability, \n \t' +
            'Risks.OverallImpact AS RiskOverallImpact \n' +
            'FROM Cases \n' +
            'LEFT JOIN CaseTypes ON Cases.TypeId=CaseTypes.Id \n' +
            'JOIN Milestones ON Milestones.Id=Cases.MilestoneId \n' +
            'JOIN MilestoneTypes ON Milestones.TypeId=MilestoneTypes.Id \n' +
            'JOIN Contracts ON Milestones.ContractId=Contracts.Id \n' +
            'LEFT JOIN OurContractsData ON OurContractsData.Id=Contracts.Id \n' +
            'LEFT JOIN Risks ON Risks.CaseId=Cases.Id \n' +
            'JOIN MilestoneTypes_ContractTypes ON MilestoneTypes_ContractTypes.MilestoneTypeId=Milestones.TypeId AND MilestoneTypes_ContractTypes.ContractTypeId=Contracts.TypeId \n' +
            'WHERE ' + projectCondition + ' AND ' + contractCondition + ' AND ' + milestoneCondition + ' AND ' + caseCondition + ' \n' +
            'ORDER BY Contracts.Id, Milestones.Id, CaseTypes.FolderNumber';

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processCasesResult(result, initParamObject);
    }

    static async processCasesResult(result: any[], initParamObject: { projectId?: string, contractId?: number, milestoneId?: number }) {
        let newResult: Case[] = [];

        let [processes, processesInstances] = await Promise.all([
            ProcesesController.getProcessesList(initParamObject),
            ProcessInstancesController.getProcessInstancesList(initParamObject)
        ]);
        for (const row of result) {
            var item = new Case({
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
                _parent: {
                    id: row.MilestoneId,
                    contractId: row.ContractId,
                    gdFolderId: row.MilestoneGdFolderId,
                    _type: {
                        id: row.MilestoneTypeId,
                        name: row.MilestoneTypeName,
                        _folderNumber: row.MilestoneTypeFolderNumber,
                    },
                    _parent: {
                        ourId: row.ContractOurId,
                        number: row.ContractNumber,
                        alias: row.ContractAlias,
                        name: ToolsDb.sqlToString(row.ContractName),
                    }
                },
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
}