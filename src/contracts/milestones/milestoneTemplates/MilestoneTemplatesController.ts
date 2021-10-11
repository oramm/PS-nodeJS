

import ToolsDb from "../../../tools/ToolsDb";
import MilestoneTemplate from "./MilestoneTemplate";

export default class MilestoneTemplatesController {
    static async getMilestoneTemplatesList(initParamObject: { isDefaultOnly?: boolean, contractTypeId?: number }) {
        const isDefaultCondition = (initParamObject && initParamObject.isDefaultOnly) ? 'MilestoneTypes_ContractTypes.IsDefault=TRUE' : '1';
        const contractTypeCondition = (initParamObject && initParamObject.contractTypeId) ? 'MilestoneTypes_ContractTypes.ContractTypeId=' + initParamObject.contractTypeId : '1';

        const sql = `SELECT  MilestoneTemplates.Id,
            MilestoneTemplates.Name,
            MilestoneTemplates.Description,
            MilestoneTemplates.StartDateRule,
            MilestoneTemplates.EndDateRule,
            MilestoneTemplates.LastUpdated,
            MilestoneTypes_ContractTypes.FolderNumber,
            MilestoneTypes.Id AS MilestoneTypeId,
            MilestoneTypes.IsUniquePerContract,
            MilestoneTypes.Name AS MilestoneTypeName
            FROM MilestoneTemplates
            JOIN MilestoneTypes ON MilestoneTypes.Id=MilestoneTemplates.MilestoneTypeId
            JOIN MilestoneTypes_ContractTypes ON MilestoneTypes.Id=MilestoneTypes_ContractTypes.MilestoneTypeId
            WHERE ${isDefaultCondition} AND ${contractTypeCondition}
            GROUP BY MilestoneTemplates.Id
            ORDER BY MilestoneTemplates.Name`;


        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processMilestoneTemplatesResult(result);
    }

    static processMilestoneTemplatesResult(result: any[]) {
        let newResult: MilestoneTemplate[] = [];

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