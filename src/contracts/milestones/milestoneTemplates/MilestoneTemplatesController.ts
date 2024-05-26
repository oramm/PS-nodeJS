import ToolsDb from '../../../tools/ToolsDb';
import mysql from 'mysql2/promise';
import MilestoneTemplate from './MilestoneTemplate';
export type MilestoneTemplatesSearchParams = {
    isDefaultOnly?: boolean;
    contractTypeId?: number;
    milestoneTypeId?: number;
};

export default class MilestoneTemplatesController {
    static async getMilestoneTemplatesList(
        searchParams: MilestoneTemplatesSearchParams,
        templateType?: 'CONTRACT' | 'OFFER'
    ) {
        console.log('searchParams', searchParams);
        console.log('templateType', templateType);
        const isDefaultCondition =
            templateType === 'CONTRACT' && searchParams.isDefaultOnly
                ? mysql.format('MilestoneTypes_ContractTypes.IsDefault = ?', [
                      1,
                  ])
                : '1';

        const contractTypeCondition =
            templateType === 'CONTRACT' && searchParams.contractTypeId
                ? mysql.format(
                      'MilestoneTypes_ContractTypes.ContractTypeId = ?',
                      [searchParams.contractTypeId]
                  )
                : '1';

        const templateTypeCondition =
            templateType === 'CONTRACT'
                ? 'MilestoneTypes_ContractTypes.MilestoneTypeId IS NOT NULL'
                : 'MilestoneTypes_Offers.MilestoneTypeId IS NOT NULL';

        const milestoneTypeIdCondition =
            searchParams.milestoneTypeId !== undefined
                ? mysql.format('MilestoneTemplates.MilestoneTypeId = ?', [
                      searchParams.milestoneTypeId,
                  ])
                : '1';

        const sql = `SELECT MilestoneTemplates.Id,
            MilestoneTemplates.Name,
            MilestoneTemplates.Description,
            MilestoneTemplates.StartDateRule,
            MilestoneTemplates.EndDateRule,
            MilestoneTemplates.TemplateType,
            MilestoneTemplates.LastUpdated,
            COALESCE(MilestoneTypes_ContractTypes.FolderNumber, MilestoneTypes_Offers.FolderNumber) AS FolderNumber,
            MilestoneTypes.Id AS MilestoneTypeId,
            MilestoneTypes.IsUniquePerContract,
            MilestoneTypes.Name AS MilestoneTypeName
            FROM MilestoneTemplates
            JOIN MilestoneTypes ON MilestoneTypes.Id=MilestoneTemplates.MilestoneTypeId
            LEFT JOIN MilestoneTypes_ContractTypes ON MilestoneTypes.Id=MilestoneTypes_ContractTypes.MilestoneTypeId
            LEFT JOIN MilestoneTypes_Offers ON MilestoneTypes.Id=MilestoneTypes_Offers.MilestoneTypeId
            WHERE   ${isDefaultCondition} 
                AND ${contractTypeCondition}
                AND ${templateTypeCondition}
                AND ${milestoneTypeIdCondition}
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
                templateType: row.TemplateType,
                lastUpdated: row.LastUpdated,
                _milestoneType: {
                    id: row.MilestoneTypeId,
                    name: row.MilestoneTypeName,
                    _folderNumber: row.FolderNumber,
                    isUniquePerContract: row.IsUniquePerContract,
                },
            });
            newResult.push(item);
        }
        return newResult;
    }
}
