
import mysql from 'mysql2/promise';
import ToolsDb from "../../../tools/ToolsDb";
import MilestoneType from "./MilestoneType";

export default class MilestoneTypesController {
    static async getMilestoneTypesList(initParamObject: any) {
        const projectIdCondition = initParamObject.projectId
            ? mysql.format('Contracts.ProjectOurId = ?', [initParamObject.projectId])
            : '1';

        const sql = `SELECT  
                MilestoneTypes_ContractTypes.MilestoneTypeId,
                MilestoneTypes_ContractTypes.ContractTypeId,
                MilestoneTypes_ContractTypes.FolderNumber,
                MilestoneTypes.Name AS "MilestoneTypeName",
                MilestoneTypes.Description AS "MilestoneTypeDescription",
                MilestoneTypes_ContractTypes.IsDefault,
                MilestoneTypes.IsInScrumByDefault,
                MilestoneTypes.IsUniquePerContract,
                MilestoneTypes.LastUpdated,
                MilestoneTypes.EditorId,
                ContractTypes.Name AS "ContractTypeName",
                ContractTypes.Description AS "ContractTypeDescription"
            FROM MilestoneTypes_ContractTypes
            JOIN MilestoneTypes ON MilestoneTypes_ContractTypes.MilestoneTypeId = MilestoneTypes.Id
            JOIN ContractTypes ON MilestoneTypes_ContractTypes.ContractTypeId = ContractTypes.Id
            JOIN Contracts ON Contracts.TypeId = MilestoneTypes_ContractTypes.ContractTypeId
            WHERE ${projectIdCondition}
            GROUP BY MilestoneTypes_ContractTypes.MilestoneTypeId
            ORDER BY ContractTypes.Name, MilestoneTypes.Name`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processMilestoneTypesResult(result);
    }

    static processMilestoneTypesResult(result: any[]): [MilestoneType?] {
        let newResult: [MilestoneType?] = [];

        for (const row of result) {
            const item = new MilestoneType({
                id: row.MilestoneTypeId,
                name: row.MilestoneTypeName,
                description: row.MilestoneTypeDescription,
                _contractType: {
                    id: row.ContractTypeId,
                    name: row.ContractTypeName,
                    description: row.ContractTypeDescription,
                },
                _folderNumber: row.FolderNumber,
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