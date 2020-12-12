

import ToolsDb from "../../../tools/ToolsDb";
import MilestoneType from "./MilestoneType";

export default class MilestoneTypesController {
    static async getMilestoneTypesList(initParamObject: any) {
        const projectIdCondition = (initParamObject.projectId) ? 'Contracts.ProjectOurId = "' + initParamObject.projectId + '"' : '1'
        const sql = 'SELECT  MilestoneTypes_ContractTypes.MilestoneTypeId, \n \t' +
            'MilestoneTypes_ContractTypes.ContractTypeId, \n \t' +
            'MilestoneTypes_ContractTypes.FolderNumber, \n \t' +
            'MilestoneTypes.Name AS "MilestoneTypeName", \n \t' +
            'MilestoneTypes.Description AS "MilestoneTypeDescription", \n \t' +
            'MilestoneTypes_ContractTypes.IsDefault, \n \t' +
            'MilestoneTypes.IsInScrumByDefault, \n \t' +
            'MilestoneTypes.IsUniquePerContract, \n \t' +
            'MilestoneTypes.LastUpdated, \n \t' +
            'MilestoneTypes.EditorId, \n \t' +
            'ContractTypes.Name AS "ContractTypeName", \n \t' +
            'ContractTypes.Description AS "ContractTypeDescription" \n' +
            'FROM MilestoneTypes_ContractTypes \n' +
            'JOIN MilestoneTypes ON MilestoneTypes_ContractTypes.MilestoneTypeId = MilestoneTypes.Id \n' +
            'JOIN ContractTypes ON MilestoneTypes_ContractTypes.ContractTypeId = ContractTypes.Id \n' +
            'JOIN Contracts ON Contracts.TypeId = MilestoneTypes_ContractTypes.ContractTypeId \n' +
            'WHERE ' + projectIdCondition + ' \n' +
            //'GROUP BY MilestoneTypes_ContractTypes.MilestoneTypeId \n' + 
            'ORDER BY ContractTypes.Name, MilestoneTypes.Name';


        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processMilestoneTypesResult(result);
    }

    static processMilestoneTypesResult(result: any[]): [MilestoneType?] {
        let newResult: [MilestoneType?] = [];

        for (const row of result) {
            var item = new MilestoneType({
                id: row.MilestoneTypeId,
                name: row.MilestoneTypeName,
                description: row.MilestoneTypeDescription,
                _isDefault: row.IsDefault,
                isInScrumByDefault: row.IsInScrumByDefault,
                isUniquePerContract: row.IsUniquePerContract,
                lastUpdated: row.LastUpdated,
            });
            newResult.push(item);
        }
        return newResult;
    }
}