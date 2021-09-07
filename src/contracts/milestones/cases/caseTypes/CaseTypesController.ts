

import ProcessesController from "../../../../processes/ProcesesController";
import ToolsDb from "../../../../tools/ToolsDb";
import CaseType from "./CaseType";

export default class CaseTypesController {
    static async getCaseTypesList(initParamObject: any) {
        const milestoneCondition = (initParamObject && initParamObject.milestoneId) ? 'CaseTypes.MilestoneTypeId=(SELECT TypeId FROM Milestones WHERE Id=' + initParamObject.milestoneId + ') OR CaseTypes.MilestoneTypeId=NULL' : '1';
        const milestoneTypeCondition = (initParamObject && initParamObject.milestoneTypeId) ? 'CaseTypes.MilestoneTypeId=' + initParamObject.milestoneTypeId : '1';

        const sql = 'SELECT  CaseTypes.Id, \n \t' +
            'CaseTypes.Name, \n \t' +
            'CaseTypes.Description, \n \t' +
            'CaseTypes.IsDefault, \n \t' +
            'CaseTypes.IsUniquePerMilestone, \n \t' +
            'CaseTypes.MilestoneTypeId, \n \t' +
            'CaseTypes.FolderNumber, \n \t' +
            'CaseTypes.LastUpdated, \n \t' +
            'CaseTypes.EditorId \n' +
            'FROM CaseTypes \n' +
            'WHERE ' + milestoneCondition + ' AND ' + milestoneTypeCondition;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processCaseTypesResult(result);
    }

    static async processCaseTypesResult(result: any[]) {
        let newResult: [CaseType?] = [];
        const processes = await ProcessesController.getProcessesList({});
        for (const row of result) {
            const item = new CaseType({
                id: row.Id,
                name: row.Name,
                description: row.Description,
                isDefault: row.IsDefault,
                isUniquePerMilestone: row.IsUniquePerMilestone,
                _milestoneType: { id: row.MilestoneTypeId },
                folderNumber: row.FolderNumber,
                _processes: processes.filter((item: any) => item._caseType.id == row.Id)
            });
            newResult.push(item);
        }
        return newResult;
    }
}