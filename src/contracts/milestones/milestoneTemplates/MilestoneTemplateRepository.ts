import BaseRepository from '../../../repositories/BaseRepository';
import MilestoneTemplate from './MilestoneTemplate';
import ToolsDb from '../../../tools/ToolsDb';
import mysql from 'mysql2/promise';

export type MilestoneTemplatesSearchParams = {
    isDefaultOnly?: boolean;
    contractTypeId?: number;
    milestoneTypeId?: number;
    templateType?: 'CONTRACT' | 'OFFER';
};

export default class MilestoneTemplateRepository extends BaseRepository<MilestoneTemplate> {
    constructor() {
        super('MilestoneTemplates');
    }

    /**
     * Wyszukuje szablony kamieni milowych według parametrów
     * Repository Layer - zawiera TYLKO logikę SQL i mapowanie
     * @param searchParams - Parametry wyszukiwania
     * @returns Promise<MilestoneTemplate[]>
     */
    async find(
        searchParams: MilestoneTemplatesSearchParams = {}
    ): Promise<MilestoneTemplate[]> {
        const { isDefaultOnly, contractTypeId, milestoneTypeId, templateType } =
            searchParams;

        // Budowanie warunków SQL
        const isDefaultCondition =
            templateType === 'CONTRACT' && isDefaultOnly
                ? mysql.format('MilestoneTypes_ContractTypes.IsDefault = ?', [
                      1,
                  ])
                : '1';

        const contractTypeCondition =
            templateType === 'CONTRACT' && contractTypeId
                ? mysql.format(
                      'MilestoneTypes_ContractTypes.ContractTypeId = ?',
                      [contractTypeId]
                  )
                : '1';

        const templateTypeCondition =
            templateType === 'CONTRACT'
                ? 'MilestoneTypes_ContractTypes.MilestoneTypeId IS NOT NULL'
                : templateType === 'OFFER'
                ? 'MilestoneTypes_Offers.MilestoneTypeId IS NOT NULL'
                : '1';

        const milestoneTypeIdCondition =
            milestoneTypeId !== undefined
                ? mysql.format('MilestoneTemplates.MilestoneTypeId = ?', [
                      milestoneTypeId,
                  ])
                : '1';

        // Zapytanie SQL - identyczne jak w oryginalnej wersji
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
            WHERE ${isDefaultCondition} 
                AND ${contractTypeCondition}
                AND ${templateTypeCondition}
                AND ${milestoneTypeIdCondition}
            GROUP BY MilestoneTemplates.Id
            ORDER BY MilestoneTemplates.Name`;

        const results: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return results.map((row: any) => this.mapRowToModel(row));
    }

    /**
     * Mapuje wiersz z bazy danych na instancję MilestoneTemplate
     * WSZYSTKIE pola z SELECT są zachowane
     * @param row - Wiersz z bazy danych
     * @returns MilestoneTemplate
     */
    protected mapRowToModel(row: any): MilestoneTemplate {
        return new MilestoneTemplate({
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
    }
}
