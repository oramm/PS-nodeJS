import BaseRepository from '../repositories/BaseRepository';
import Project from './Project';
import ToolsDb from '../tools/ToolsDb';
import mysql from 'mysql2/promise';
import Entity from '../entities/Entity';
import ProjectEntity from './ProjectEntity';
import Setup from '../setup/Setup';

export type ProjectSearchParams = {
    id?: number;
    ourId?: string;
    searchText?: string;
    systemEmail?: string;
    onlyKeyData?: boolean;
    contractId?: number;
    status?: string;
};

/**
 * Repository dla Project - warstwa dostępu do danych
 *
 * Zgodnie z Clean Architecture:
 * - Dziedziczy po BaseRepository<Project>
 * - Odpowiedzialny TYLKO za operacje CRUD i SQL
 * - NIE zawiera logiki biznesowej
 */
export default class ProjectRepository extends BaseRepository<Project> {
    constructor() {
        super('Projects');
    }

    /**
     * Wyszukuje Projects w bazie danych
     *
     * @param orConditions - Warunki wyszukiwania (OR groups)
     * @returns Promise<Project[]> - Lista znalezionych Projects
     */
    async find(orConditions: ProjectSearchParams[] = []): Promise<Project[]> {
        const sql = `SELECT  Projects.Id,
                Projects.OurId,
                Projects.Name,
                Projects.Alias, 
                Projects.StartDate, 
                Projects.EndDate, 
                Projects.Status, 
                Projects.Comment, 
                Projects.FinancialComment, 
                Projects.InvestorId, 
                Projects.TotalValue, 
                Projects.QualifiedValue, 
                Projects.DotationValue, 
                Projects.GdFolderId, 
                Projects.LettersGdFolderId, 
                Projects.GoogleGroupId, 
                Projects.GoogleCalendarId, 
                Projects.LastUpdated
                FROM Projects
                WHERE ${this.makeOrGroupsConditions(
                    orConditions,
                    this.makeAndConditions.bind(this)
                )}
                GROUP BY Projects.OurId ASC`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);

        // Pobierz powiązane dane Entity-Project
        const entitiesPerAllProjects =
            await this.getProjectEntityAssociationsList(
                orConditions[0]?.onlyKeyData ? undefined : {}
            );

        // Mapuj wyniki
        return result.map((row) =>
            this.mapRowToModel(row, entitiesPerAllProjects)
        );
    }

    /**
     * Mapuje wiersz z bazy danych na instancję Project
     *
     * @param row - Wiersz z bazy danych
     * @param entitiesPerAllProjects - Lista asocjacji Project-Entity
     * @returns Project - Zmapowana instancja
     */
    protected mapRowToModel(
        row: any,
        entitiesPerAllProjects: ProjectEntity[] = []
    ): Project {
        const project = new Project({
            id: row.Id,
            ourId: row.OurId,
            name: ToolsDb.sqlToString(row.Name),
            alias: row.Alias,
            startDate: row.StartDate,
            endDate: row.EndDate,
            status: row.Status,
            comment: ToolsDb.sqlToString(row.Comment),
            financialComment: ToolsDb.sqlToString(row.FinancialComment),
            investorId: row.InvestorId,
            totalValue: row.TotalValue,
            qualifiedValue: row.QualifiedValue,
            dotationValue: row.DotationValue,
            gdFolderId: row.GdFolderId,
            lettersGdFolderId: row.LettersGdFolderId,
            googleGroupId: row.GoogleGroupId,
            googleCalendarId: row.GoogleCalendarId,
            lastUpdated: row.LastUpdated,
        });

        project.setProjectEntityAssociations(entitiesPerAllProjects);
        return project;
    }

    /**
     * Tworzy warunki AND dla pojedynczej grupy warunków OR
     */
    private makeAndConditions(searchParams: ProjectSearchParams): string {
        const projectIdCondition = searchParams.id
            ? mysql.format('Projects.Id = ?', [searchParams.id])
            : '1';

        const projectOurIdCondition = searchParams.ourId
            ? mysql.format('Projects.OurId LIKE ?', [`%${searchParams.ourId}%`])
            : '1';

        let status: string | string[] | undefined = searchParams.status;
        if (searchParams.status === 'ACTIVE') {
            status = [
                Setup.ProjectStatuses.NOT_STARTED,
                Setup.ProjectStatuses.IN_PROGRESS,
            ];
        }
        const statusCondition = Array.isArray(status)
            ? mysql.format('Projects.Status IN (?)', [status])
            : searchParams.status
            ? mysql.format('Projects.Status = ?', [status])
            : '1';

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );

        return `${projectIdCondition}
            AND ${projectOurIdCondition}
            AND ${statusCondition}
            AND ${searchTextCondition}`;
    }

    /**
     * Tworzy warunek wyszukiwania tekstowego (multi-word search)
     */
    private makeSearchTextCondition(searchText: string | undefined): string {
        if (!searchText) return '1';

        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(Projects.OurId LIKE ?
                OR Projects.Name LIKE ?
                OR Projects.Alias LIKE ?)`,
                [`%${word}%`, `%${word}%`, `%${word}%`]
            )
        );

        return conditions.join(' AND ');
    }

    /**
     * Pobiera asocjacje Project-Entity
     */
    private async getProjectEntityAssociationsList(initParamObject?: {
        projectId?: string;
    }): Promise<ProjectEntity[]> {
        if (!initParamObject) return [];

        const projectCondition =
            initParamObject && initParamObject.projectId
                ? mysql.format('Projects.OurId = ?', [
                      initParamObject.projectId,
                  ])
                : '1';

        const sql = `SELECT  
            Projects_Entities.ProjectId,
            Projects_Entities.EntityId,
            Projects_Entities.ProjectRole,
            Entities.Name,
            Entities.Address,
            Entities.TaxNumber,
            Entities.Www,
            Entities.Email,
            Entities.Phone
        FROM Projects_Entities
        JOIN Projects ON Projects_Entities.ProjectId = Projects.Id
        JOIN Entities ON Projects_Entities.EntityId = Entities.Id
        WHERE ${projectCondition}
        ORDER BY Projects_Entities.ProjectRole, Entities.Name`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);

        return result.map((row) => this.mapProjectEntityAssociation(row));
    }

    /**
     * Mapuje wiersz asocjacji Project-Entity
     */
    private mapProjectEntityAssociation(row: any): ProjectEntity {
        return new ProjectEntity({
            projectRole: row.ProjectRole,
            _project: {
                id: row.ProjectId,
            },
            _entity: new Entity({
                id: row.EntityId,
                name: row.Name,
                address: row.Address,
                taxNumber: row.TaxNumber,
                www: row.Www,
                email: row.Email,
                phone: row.Phone,
            }),
        });
    }
}
