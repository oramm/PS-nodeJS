import ToolsDb from '../../../../tools/ToolsDb';
import ToolsGd from '../../../../tools/ToolsGd';
import Risk from './Risk';

export type RisksSearchParams = {
    projectId?: string;
    contractId?: number;
};

export default class RiskRepository {
    protected tableName = 'Risks';

    /**
     * Wyszukuje ryzyka według parametrów
     * Repository Layer - zawiera TYLKO logikę SQL i mapowanie
     * @param searchParams - Parametry wyszukiwania
     * @returns Promise<Risk[]>
     */
    async find(searchParams: RisksSearchParams = {}): Promise<Risk[]> {
        const projectCondition = searchParams.projectId
            ? `Risks.ProjectOurId="${searchParams.projectId}"`
            : '1';

        const contractCondition = searchParams.contractId
            ? `Contracts.Id=${searchParams.contractId}`
            : '1';

        //TODO - do obsłużenia oferty
        const sql = `SELECT Risks.Id,
                Risks.Name,
                Risks.Cause,
                Risks.ScheduleImpactDescription,
                Risks.CostImpactDescription,
                Risks.Probability,
                Risks.OverallImpact,
                OverallImpact * Probability AS Rate,
                Risks.AdditionalActionsDescription,
                Risks.CaseId,
                Risks.ProjectOurId,
                Risks.LastUpdated,
                Cases.Id AS CaseId,
                Cases.Name AS CaseName,
                Cases.GdFolderId AS CaseGdFolderId,
                CaseTypes.name AS CaseTypeName,
                CaseTypes.FolderNumber AS CaseTypeFolderNumber,
                Milestones.Id AS MilestoneId,
                Milestones.Name AS MilestoneName,
                Milestones.GdFolderId AS MilestoneGdFolderId,
                MilestoneTypes.Id AS MilestoneTypeId,
                COALESCE(MilestoneTypes_ContractTypes.FolderNumber, MilestoneTypes_Offers.FolderNumber) AS MilestoneFolderNumber,
                MilestoneTypes.Name AS MilestoneTypeName,
                OurContractsData.OurId AS ContractOurId,
                Contracts.Id AS ContractId,
                Contracts.Number AS ContractNumber,
                Contracts.Name AS ContractName
            FROM Risks
            JOIN Cases ON Risks.CaseId=Cases.Id
            JOIN CaseTypes ON CaseTypes.Id=Cases.TypeId
            JOIN Milestones ON Milestones.Id=Cases.MilestoneId
            JOIN MilestoneTypes ON MilestoneTypes.Id=Milestones.TypeId
            JOIN Contracts ON Milestones.ContractId = Contracts.Id
            LEFT JOIN OurContractsData ON Milestones.ContractId = OurContractsData.Id
            LEFT JOIN MilestoneTypes_ContractTypes ON MilestoneTypes_ContractTypes.MilestoneTypeId=MilestoneTypes.Id AND MilestoneTypes_ContractTypes.ContractTypeId=Contracts.TypeId
            LEFT JOIN MilestoneTypes_Offers ON MilestoneTypes_Offers.MilestoneTypeId=MilestoneTypes.Id
            WHERE ${projectCondition} AND ${contractCondition}`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return result.map((row) => this.mapRowToModel(row));
    }

    protected mapRowToModel(row: any): Risk {
        return new Risk({
            id: row.Id,
            name: row.Name,
            cause: row.Cause,
            scheduleImpactDescription: row.ScheduleImpactDescription,
            costImpactDescription: row.CostImpactDescription,
            probability: row.Probability,
            overallImpact: row.OverallImpact,
            rate: row.Rate,
            additionalActionsDescription: row.AdditionalActionsDescription,
            caseId: row.CaseId,
            projectOurId: row.ProjectOurId,
            lastUpdated: row.LastUpdated,
            _case: {
                id: row.CaseId,
                name: row.CaseName,
                gdFolderId: row.CaseGdFolderId,
                _type: {
                    name: row.CaseTypeName,
                    folderNumber: row.CaseTypeFolderNumber,
                },
            },
            //parentem jest Milestone
            _parent: {
                id: row.MilestoneId,
                name: row.MilestoneName,
                gdFolderId: row.MilestoneGdFolderId,
                _folderNumber: row.MilestoneFolderNumber,
                _type: {
                    id: row.MilestoneTypeId,
                    //folderNumber: dbResults.getString(22),
                    name: row.MilestoneTypeName,
                },
                _parent: {
                    ourIdNumberName:
                        row.ContractOurId +
                        ' ' +
                        row.ContractNumber +
                        ' ' +
                        row.ContractName,
                    id: row.ContractId,
                },
            },
        });
    }
}
