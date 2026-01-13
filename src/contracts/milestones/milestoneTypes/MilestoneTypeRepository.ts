import BaseRepository from '../../../repositories/BaseRepository';
import MilestoneType from './MilestoneType';
import ToolsDb from '../../../tools/ToolsDb';
import mysql from 'mysql2/promise';
import Project from '../../../projects/Project';

export type MilestoneTypesSearchParams = {
    _project?: Project;
};

/**
 * Repository dla MilestoneType - warstwa dostępu do danych
 * ZGODNIE Z WYTYCZNYMI Clean Architecture:
 * - Tylko operacje SQL i mapowanie DB → Model
 * - NIE zawiera logiki biznesowej (→ Model)
 * - NIE zarządza transakcjami (→ Controller)
 */
export default class MilestoneTypeRepository extends BaseRepository<MilestoneType> {
    constructor() {
        super('MilestoneTypes');
    }

    /**
     * Wyszukuje MilestoneTypes według warunków
     * @param orConditions - Tablica warunków połączonych przez OR
     * @returns Promise<MilestoneType[]> - Lista znalezionych MilestoneTypes
     */
    async find(
        orConditions: MilestoneTypesSearchParams[] = []
    ): Promise<MilestoneType[]> {
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
            WHERE ${this.makeOrGroupsConditions(
                orConditions,
                this.makeAndConditions.bind(this)
            )}
            ORDER BY ContractTypes.Name, MilestoneTypes.Name`;

        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToModel(row));
    }

    /**
     * Tworzy warunki AND dla pojedynczej grupy OR
     * @param searchParams - Parametry wyszukiwania
     * @returns string - Warunki SQL
     */
    private makeAndConditions(
        searchParams: MilestoneTypesSearchParams
    ): string {
        const projectOurId = searchParams._project?.ourId;
        const projectCondition = projectOurId
            ? mysql.format(`Contracts.ProjectOurId = ? `, [projectOurId])
            : '1';

        return `${projectCondition}`;
    }

    /**
     * Mapuje wiersz z bazy danych na instancję MilestoneType
     * @param row - Wiersz z bazy danych
     * @returns MilestoneType - Instancja modelu
     */
    protected mapRowToModel(row: any): MilestoneType {
        return new MilestoneType({
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
    }
}
