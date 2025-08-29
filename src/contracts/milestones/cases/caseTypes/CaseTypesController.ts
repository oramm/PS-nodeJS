import mysql from 'mysql2/promise';
import ProcessesController from "../../../../processes/ProcesesController";
import ToolsDb from "../../../../tools/ToolsDb";
import CaseType from "./CaseType";

export default class CaseTypesController {
    static async getCaseTypesList(orConditions: any[] | undefined = []) {
        const sql = `SELECT  
                CaseTypes.Id,
                CaseTypes.Name,
                CaseTypes.Description,
                CaseTypes.IsDefault,
                CaseTypes.IsUniquePerMilestone,
                CaseTypes.MilestoneTypeId,
                CaseTypes.FolderNumber,
                CaseTypes.LastUpdated,
                CaseTypes.EditorId
            FROM CaseTypes
            WHERE ${ToolsDb.makeOrGroupsConditions(orConditions, this.makeAndConditions.bind(this))}`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processCaseTypesResult(result);
    }

    static makeAndConditions(initParamObject: any) {
        const milestoneCondition = initParamObject.milestoneId
            ? mysql.format(`(CaseTypes.MilestoneTypeId=(SELECT TypeId FROM Milestones WHERE Id=?) OR CaseTypes.MilestoneTypeId IS NULL)`, [initParamObject.milestoneId])
            : '1';

        const milestoneTypeCondition = initParamObject.milestoneTypeId
            ? mysql.format(`CaseTypes.MilestoneTypeId=?`, [initParamObject.milestoneTypeId])
            : '1';

        return `${milestoneCondition} 
            AND ${milestoneTypeCondition}`;
    }

    static async processCaseTypesResult(result: any[]) {
        let newResult: [CaseType?] = [];
        const processes = await ProcessesController.find({});
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