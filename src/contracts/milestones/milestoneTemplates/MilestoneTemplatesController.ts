

import ToolsDb from "../../../tools/ToolsDb";
import MilestoneTemplate from "./MilestoneTemplate";

export default class MilestoneTemplatesController {
    static async getMilestoneTemplatesList(initParamObject: any) {
        const isDefaultCondition = (initParamObject && initParamObject.isDefaultOnly) ? 'MilestoneTypes_ContractTypes.IsDefault=TRUE' : '1';
        const condition = (initParamObject && initParamObject.contractTypeId) ? 'MilestoneTypes_ContractTypes.ContractTypeId=' + initParamObject.contractTypeId : '1';

        const sql = 'SELECT  MilestoneTemplates.Id, \n \t' +
            'MilestoneTemplates.Name, \n \t' +
            'MilestoneTemplates.Description, \n \t' +
            'MilestoneTemplates.StartDateRule, \n \t' +
            'MilestoneTemplates.EndDateRule, \n \t' +
            'MilestoneTemplates.LastUpdated, \n \t' +
            'MilestoneTypes_ContractTypes.FolderNumber, \n \t' +
            'MilestoneTypes.Id AS MilestoneTypeId, \n \t' +
            'MilestoneTypes.IsUniquePerContract, \n \t' +
            'MilestoneTypes.Name AS MilestoneTypeName \n' +
            'FROM MilestoneTemplates \n' +
            'JOIN MilestoneTypes ON MilestoneTypes.Id=MilestoneTemplates.MilestoneTypeId \n' +
            'JOIN MilestoneTypes_ContractTypes ON MilestoneTypes.Id=MilestoneTypes_ContractTypes.MilestoneTypeId \n' +
            'WHERE ' + isDefaultCondition + ' AND ' + condition + '\n' +
            'GROUP BY MilestoneTemplates.Id \n' +
            'ORDER BY MilestoneTemplates.Name';


        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processMilestoneTemplatesResult(result);
    }

    static processMilestoneTemplatesResult(result: any[]): [MilestoneTemplate?] {
        let newResult: [MilestoneTemplate?] = [];

        for (const row of result) {
            const item = new MilestoneTemplate({
                id: row.Id,
                name: row.Name,
                description: row.Description,
                startDateRule: row.StartDateRule,
                endDateRule: row.EndDateRule,
                lastUpdated: row.LastUpdated,
                _milestoneType: {
                    id: row.MilestoneTypeId,
                    name: row.MilestoneTypeName,
                    _folderNumber: row.FolderNumber,
                    isUniquePerContract: row.IsUniquePerContract
                },

            });
            newResult.push(item);
        }
        return newResult;
    }
}