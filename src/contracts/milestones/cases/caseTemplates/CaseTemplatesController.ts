import ToolsDb from '../../../../tools/ToolsDb';
import mysql from 'mysql2/promise';
import MilestoneType from '../../milestoneTypes/MilestoneType';
import CaseType from '../caseTypes/CaseType';
import CaseTemplate from './CaseTemplate';

export type CaseTemplatesSearchParams = {
    isDefaultOnly?: boolean;
    isInScrumByDefaultOnly?: boolean;
    contractTypeId?: number;
    milestoneTypeId?: number;
};

export default class CaseTemplatesController {
    static async getCaseTemplatesList(
        searchParams: CaseTemplatesSearchParams,
        milestoneParentType: 'CONTRACT' | 'OFFER' = 'CONTRACT'
    ) {
        const isDefaultCondition = searchParams.isDefaultOnly
            ? 'CaseTypes.IsDefault = TRUE'
            : '1';

        const isInScrumDefaultCondition = searchParams.isInScrumByDefaultOnly
            ? 'CaseTypes.IsInScrumByDefault = TRUE'
            : '1';

        const contractTypeIdCondition =
            searchParams.contractTypeId && milestoneParentType === 'CONTRACT'
                ? mysql.format(
                      'MilestoneTypes_ContractTypes.ContractTypeId = ?',
                      [searchParams.contractTypeId]
                  )
                : '1';

        const milestoneTypeIdCondition = searchParams.milestoneTypeId
            ? mysql.format('MilestoneTypes.Id = ?', [
                  searchParams.milestoneTypeId,
              ])
            : '1=1';

        const typeIdCondition =
            milestoneParentType === 'CONTRACT'
                ? 'MilestoneTypes_ContractTypes.MilestoneTypeId IS NOT NULL'
                : 'MilestoneTypes_Offers.MilestoneTypeId IS NOT NULL';

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
                MilestoneTypes.IsUniquePerContract AS MilestoneTypeIsUniquePerContract,
                COALESCE(MilestoneTypes_ContractTypes.IsDefault, TRUE) AS MilestoneTypeIsDefault
            FROM CaseTemplates
            JOIN CaseTypes ON CaseTypes.Id=CaseTemplates.CaseTypeId
            JOIN MilestoneTypes ON CaseTypes.MilestoneTypeId=MilestoneTypes.Id
            LEFT JOIN MilestoneTypes_ContractTypes ON MilestoneTypes.Id=MilestoneTypes_ContractTypes.MilestoneTypeId
            LEFT JOIN MilestoneTypes_Offers ON MilestoneTypes.Id= MilestoneTypes_Offers.MilestoneTypeId
            WHERE   ${isDefaultCondition} 
                AND ${isInScrumDefaultCondition} 
                AND ${contractTypeIdCondition} 
                AND ${milestoneTypeIdCondition}
                AND ${typeIdCondition}
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
                templateComment: '',
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
                        _isDefault: row.MilestoneTypeIsDefault,
                        isUniquePerContract:
                            row.MilestoneTypeIsUniquePerContract,
                    }),
                }),
                caseTypeId: row.CaseTypeId,
            });
            newResult.push(item);
        }
        return newResult;
    }
}
