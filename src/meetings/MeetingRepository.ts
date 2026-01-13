import BaseRepository from '../repositories/BaseRepository';
import ToolsDb from '../tools/ToolsDb';
import Meeting from './Meeting';

/**
 * Parametry wyszukiwania spotkań
 */
export type MeetingSearchParams = {
    id?: number;
    projectId?: string;
    contractId?: number;
};

/**
 * Repository dla Meeting - warstwa dostępu do danych
 *
 * Zgodnie z Clean Architecture:
 * - Dziedziczy po BaseRepository<Meeting>
 * - Zawiera SQL i mapowanie danych
 * - NIE zawiera logiki biznesowej
 */
export default class MeetingRepository extends BaseRepository<Meeting> {
    constructor() {
        super('Meetings');
    }

    /**
     * Wyszukuje spotkania według podanych warunków
     *
     * @param orConditions - Warunki wyszukiwania (OR groups)
     * @returns Promise<Meeting[]> - Lista znalezionych spotkań
     */
    async find(orConditions: MeetingSearchParams[] = []): Promise<Meeting[]> {
        const sql = `SELECT 
                Meetings.Id,
                Meetings.Name,
                Meetings.Description,
                Meetings.Date,
                Meetings.ProtocolGdId,
                Meetings.Location,
                Contracts.Id AS ContractId,
                Contracts.Number AS ContractNumber,
                Contracts.Name AS ContractName,
                Contracts.GdFolderId AS ContractGdFolderId,
                OurContractsData.OurId AS ContractOurId,
                ContractTypes.Id AS ContractTypeId,
                ContractTypes.Name AS ContractTypeName,
                ContractTypes.IsOur AS ContractTypeIsOur,
                ContractTypes.Description AS ContractTypeDescription,
                Projects.OurId AS ProjectOurId,
                Projects.Name AS ProjectName,
                Projects.GdFolderId AS ProjectGdFolderId
            FROM Meetings
            JOIN Contracts ON Contracts.Id = Meetings.ContractId
            LEFT JOIN OurContractsData ON OurContractsData.Id = Contracts.Id
            JOIN ContractTypes ON ContractTypes.Id = Contracts.TypeId
            JOIN Projects ON Projects.OurId = Contracts.ProjectOurId
            WHERE ${ToolsDb.makeOrGroupsConditions(
                orConditions,
                this.makeAndConditions.bind(this)
            )}
            ORDER BY Meetings.Date DESC`;

        const result: any[] = await this.executeQuery(sql);
        return result.map((row) => this.mapRowToModel(row));
    }

    /**
     * Buduje warunki AND dla klauzuli WHERE
     */
    private makeAndConditions(condition: MeetingSearchParams): string {
        const conditions: string[] = [];

        if (condition.id) {
            conditions.push(`Meetings.Id = ${condition.id}`);
        }
        if (condition.projectId) {
            conditions.push(
                `Contracts.ProjectOurId = "${condition.projectId}"`
            );
        }
        if (condition.contractId) {
            conditions.push(`Meetings.ContractId = ${condition.contractId}`);
        }

        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    /**
     * Mapuje wiersz z bazy danych na instancję Meeting
     */
    protected mapRowToModel(row: any): Meeting {
        return new Meeting({
            id: row.Id,
            name: row.Name,
            description: row.Description,
            date: row.Date,
            protocolGdId: row.ProtocolGdId,
            location: row.Location,
            _contract: {
                id: row.ContractId,
                number: row.ContractNumber,
                name: ToolsDb.sqlToString(row.ContractName),
                gdFolderId: row.ContractGdFolderId,
                ourId: row.ContractOurId,
                _parent: {
                    ourId: row.ProjectOurId,
                    name: row.ProjectName,
                    gdFolderId: row.ProjectGdFolderId,
                },
                _type: {
                    id: row.ContractTypeId,
                    name: row.ContractTypeName,
                    description: row.ContractTypeDescription,
                    isOur: row.ContractTypeIsOur,
                },
            },
        });
    }
}
