

import ToolsDb from "../../../../tools/ToolsDb";
import MilestoneType from "../../milestoneTypes/MilestoneType";
import CaseType from "../caseTypes/CaseType";
import CaseTemplate from "./CaseTemplate";

export default class CaseTemplatesController {
    static async getCaseTemplatesList(initParamObject: any) {
        const isDefaultCondition = (initParamObject.isDefaultOnly) ? 'CaseTypes.IsDefault=TRUE' : '1';
        const isInScrumDefaultCondition = (initParamObject.isInScrumByDefaultOnly) ? 'CaseTypes.IsInScrumByDefault=TRUE' : '1';
        const contractTypeIdCondition = (initParamObject.contractTypeId) ? 'MilestoneTypes_ContractTypes.ContractTypeId=' + initParamObject.contractTypeId : '1';
        const milestoneTypeIdCondition = (initParamObject.milestoneTypeId) ? 'MilestoneTypes.Id=' + initParamObject.milestoneTypeId : '1';
        const sql = `SELECT CaseTemplates.Id,
                CaseTemplates.Name,
                CaseTemplates.Description,
                CaseTypes.Id AS CaseTypeId,
                CaseTypes.Name AS CaseTypeName,
                CaseTypes.FolderNumber AS CaseTypeFolderNumber,
                CaseTypes.IsInScrumByDefault  AS CaseTypeIsInScrumByDefault,
                CaseTypes.IsUniquePerMilestone  AS CaseTypeIsUniquePerMilestone,
                CaseTypes.IsDefault AS CaseTypeIsDefault,
                MilestoneTypes.Id AS MilestoneTypeId,
                MilestoneTypes.Name AS MilestoneTypeName,
                MilestoneTypes_ContractTypes.IsDefault AS MilestoneTypeIsDefault
            FROM CaseTemplates
            JOIN CaseTypes ON CaseTypes.Id=CaseTemplates.CaseTypeId
            JOIN MilestoneTypes ON CaseTypes.MilestoneTypeId=MilestoneTypes.Id
            JOIN MilestoneTypes_ContractTypes ON MilestoneTypes.Id=MilestoneTypes_ContractTypes.MilestoneTypeId
            WHERE ${isDefaultCondition} AND ${isInScrumDefaultCondition} AND ${contractTypeIdCondition} AND ${milestoneTypeIdCondition}
            GROUP BY CaseTemplates.Id`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processCaseTemplatesResult(result);
    }

    static processCaseTemplatesResult(result: any[]): [CaseTemplate?] {
        let newResult: [CaseTemplate?] = [];

        for (const row of result) {
            const item = new CaseTemplate({
                id: row.Id,
                name: row.Name,
                description: row.Description,
                templateComment: "",
                _caseType: new CaseType({
                    id: row.CaseTypeId,
                    name: row.CaseTypeName,
                    folderNumber: row.CaseTypeFolderNumber,
                    isDefault: row.CaseTypeIsDefault,
                    isInScrumByDefault: row.CaseTypeIsInScrumByDefault,
                    isUniquePerMilestone: row.CaseTypeIsUniquePerMilestone,
                    _milestoneType: new MilestoneType({
                        id: row.MilestoneTypeId,
                        name: row.MilestoneTypeName,
                        _isDefault: row.MilestoneTypeIsDefault
                    })
                }),
                caseTypeId: row.CaseTypeId,
            });
            newResult.push(item);
        }
        return newResult;
    }
}