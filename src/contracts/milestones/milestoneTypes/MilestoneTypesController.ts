import mysql from 'mysql2/promise';
import ToolsDb from '../../../tools/ToolsDb';
import MilestoneType from './MilestoneType';
import Project from '../../../projects/Project';

export type MilestoneTypesSearchParams = {
    _project?: Project;
};

export default class MilestoneTypesController {
    static async getMilestoneTypesList(
        orConditions: MilestoneTypesSearchParams[] = []
    ) {
        const sql = `SELECT DISTINCT
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
                ContractTypes.Description AS "ContractTypeDescription",
                ContractTypes.IsOur AS "ContractTypeIsOur"
            FROM MilestoneTypes_ContractTypes
            JOIN MilestoneTypes ON MilestoneTypes_ContractTypes.MilestoneTypeId = MilestoneTypes.Id
            JOIN ContractTypes ON MilestoneTypes_ContractTypes.ContractTypeId = ContractTypes.Id
            JOIN Contracts ON Contracts.TypeId = MilestoneTypes_ContractTypes.ContractTypeId
            WHERE ${ToolsDb.makeOrGroupsConditions(
                orConditions,
                this.makeAndConditions.bind(this)
            )}
            ORDER BY ContractTypes.Name, MilestoneTypes.Name`;
        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processMilestoneTypesResult(result);
    }

    static makeAndConditions(searchParams: MilestoneTypesSearchParams) {
        const projectOurId = searchParams._project?.ourId;
        const projectCondition = projectOurId
            ? mysql.format(`Contracts.ProjectOurId = ? `, [projectOurId])
            : '1';

        return `${projectCondition}`;
    }

    static processMilestoneTypesResult(result: any[]): MilestoneType[] {
        let newResult: MilestoneType[] = [];

        for (const row of result) {
            const item = new MilestoneType({
                id: row.MilestoneTypeId,
                name: row.MilestoneTypeName,
                description: row.MilestoneTypeDescription,
                _contractType: {
                    id: row.ContractTypeId,
                    name: row.ContractTypeName,
                    description: row.ContractTypeDescription,
                    isOur: row.ContractTypeIsOur,
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
