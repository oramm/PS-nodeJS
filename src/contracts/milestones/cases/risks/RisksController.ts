

import ToolsDb from "../../../../tools/ToolsDb";
import Risk from "./Risk";

export default class RisksController {
    static async getRisksList(initParamObject: any) {
        const projectCondition = (initParamObject.projectId) ? 'Risks.ProjectOurId="' + initParamObject.projectId + '"' : '1';
        const contractCondition = (initParamObject.contractId) ? 'Contracts.Id=' + initParamObject.contractId : '1';

        const sql = 'SELECT Risks.Id, \n \t' +
            'Risks.Name, \n \t' +
            'Risks.Cause, \n \t' +
            'Risks.ScheduleImpactDescription, \n \t' +
            'Risks.CostImpactDescription, \n \t' +
            'Risks.Probability, \n \t' +
            'Risks.OverallImpact, \n \t' +
            'OverallImpact*Probability AS Rate, \n \t' +
            'Risks.AdditionalActionsDescription, \n \t' +
            'Risks.CaseId, \n \t' +
            'Risks.ProjectOurId, \n \t' +
            'Risks.LastUpdated, \n \t' +
            'Cases.Id AS CaseId, \n \t' +
            'Cases.Name AS CaseName, \n \t' +
            'Cases.GdFolderId AS CaseGdFolderId, \n \t' +
            'CaseTypes.name AS CaseTypeName, \n \t' +
            'CaseTypes.FolderNumber AS CaseTypeFolderNumber, \n \t' +
            'Milestones.Id AS MilestoneId, \n \t' +
            'Milestones.Name AS MilestoneName, \n \t' +
            'Milestones.GdFolderId AS MilestoneGdFolderId, \n \t' +
            'MilestoneTypes.Id AS MilestoneTypeId, \n \t' +
            'MilestoneTypes_ContractTypes.FolderNumber AS MilestoneFolderNumber, \n \t' +
            'MilestoneTypes.Name AS MilestoneTypeName, \n \t' +
            'OurContractsData.OurId AS ContractOurId, \n \t' +
            'Contracts.Id AS ContractId, \n \t' +
            'Contracts.Number AS ContractNumber, \n \t' +
            'Contracts.Name AS ContractName \n' +
            'FROM Risks \n' +
            'JOIN Cases ON Risks.CaseId=Cases.Id \n' +
            'JOIN CaseTypes ON CaseTypes.Id=Cases.TypeId \n' +
            'JOIN Milestones ON Milestones.Id=Cases.MilestoneId \n' +
            'JOIN MilestoneTypes ON MilestoneTypes.Id=Milestones.TypeId \n' +
            'JOIN Contracts ON Milestones.ContractId = Contracts.Id \n' +
            'LEFT JOIN OurContractsData ON Milestones.ContractId = OurContractsData.Id \n' +
            'JOIN MilestoneTypes_ContractTypes ON MilestoneTypes_ContractTypes.MilestoneTypeId=MilestoneTypes.Id AND MilestoneTypes_ContractTypes.ContractTypeId=Contracts.TypeId\n' +
            'WHERE ' + projectCondition + ' AND ' + contractCondition;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.RisksResult(result);


    }

    static RisksResult(result: any[]): [Risk?] {
        let newResult: [Risk?] = [];

        for (const row of result) {
            var item = new Risk({
                id: row.Id,
                name: row.Name,
                cause: row.Cause,
                scheduleImpactDescription: row.ScheduleImpactDescription,
                costImpactDescription: row.CostImpactDescription,
                probability: row.Probability,
                overallImpact: row.OverallImpact,
                rate: row.Rate,
                additionalActionsDescription: row.AdditionalActionsDescription,
                caseId: row.CaseId,
                projectOurId: row.ProjectOurId,
                lastUpdated: row.LastUpdated,
                _case: {
                    id: row.CaseId,
                    name: row.CaseName,
                    gdFolderId: row.CaseGdFolderId,
                    _type: {
                        name: row.CaseTypeName,
                        folderNumber: row.CaseTypeFolderNumber
                    }
                },
                //parentem jest Milestone
                _parent: {
                    id: row.MilestoneId,
                    name: row.MilestoneName,
                    gdFolderId: row.MilestoneGdFolderId,
                    _folderNumber: row.MilestoneFolderNumber,
                    _type: {
                        id: row.MilestoneTypeId,
                        //folderNumber: dbResults.getString(22),
                        name: row.MilestoneTypeName
                    },
                    _parent: {
                        ourIdNumberName: row.ContractOurId + ' ' + row.ContractNumber + ' ' + row.ContractName,
                        id: row.ContractId
                    }
                }
            });
            newResult.push(item);
        }
        return newResult;
    }
}