import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb'
import Project from "./Project";
import Entity from '../entities/Entity';
import ProjectEntity from './ProjectEntity';
import { UserData } from '../setup/GAuth2/sessionTypes';
import Setup from '../setup/Setup';

type ProjectSearchParams = {
    userData: UserData,
    id?: number,
    ourId?: string,
    searchText?: string,
    systemEmail?: string,
    onlyKeyData?: boolean
    contractId?: number
    status?: string
}

export default class ProjectsController {
    /**pobiera listę projektów
     * @param {Object} searchParams.userData - dane użytkownika zalogowanego do systemu (z sesji)   
     */
    static async getProjectsList(orConditions: ProjectSearchParams[]) {
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
                /* JOIN Roles ON Roles.ProjectOurId = Projects.OurId */
                WHERE ${this.makeOrGroupsConditions(orConditions)}
                GROUP BY Projects.OurId ASC`;
        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processProjectsResult(result, {});
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1'

        const words = searchText.split(' ');
        const conditions = words.map(word =>
            mysql.format(`(Projects.OurId LIKE ? 
                            OR Projects.Name LIKE ?
                            OR Projects.Alias LIKE ?)`,
                [`%${word}%`, `%${word}%`, `%${word}%`]));

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    private static makeOrGroupsConditions(orConditions: ProjectSearchParams[]) {
        const orGroups = orConditions.map(orCondition => this.makeAndConditions(orCondition));
        const orGroupsCondition = orGroups.join(' OR ');
        return orGroupsCondition;
    }

    private static makeAndConditions(searchParams: ProjectSearchParams) {
        const projectIdCondition = searchParams.id
            ? mysql.format('Projects.Id = ?', [searchParams.id])
            : '1';
        const projectOurIdCondition = searchParams.ourId
            ? mysql.format('Projects.OurId LIKE ?', [`%${searchParams.ourId}%`])
            : '1';

        let status: string | string[] | undefined = searchParams.status;
        if (searchParams.status === 'ACTIVE') {
            status = [Setup.ProjectStatuses.NOT_STARTED, Setup.ProjectStatuses.IN_PROGRESS];
        }
        const statusCondition = Array.isArray(status)
            ? mysql.format('Projects.Status IN (?)', [status])
            : searchParams.status
                ? mysql.format('Projects.Status = ?', [status])
                : '1';

        const searchTextCondition = this.makeSearchTextCondition(searchParams.searchText);
        const conditions = `${projectIdCondition}
            AND ${projectOurIdCondition}
            AND ${statusCondition}
            AND ${searchTextCondition}`;
        console.log(conditions);
        return conditions;
    }

    private static async processProjectsResult(result: any[], initParamObject: any) {
        let newResult: Project[] = [];
        let entitiesPerAllProjects: any = [];
        //zostawiam bo może w przyszłości będzie analiza instytucji vs projekty
        if (!initParamObject.onlyKeyData === true)
            entitiesPerAllProjects = await this.getProjectEntityAssociationsList(initParamObject);

        for (const row of result) {
            const item = new Project({
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
                lastUpdated: row.LastUpdated
            });
            item.setProjectEntityAssociations(entitiesPerAllProjects);
            newResult.push(item);
        }
        return newResult;
    }

    static async getProjectEntityAssociationsList(initParamObject: { projectId: string }) {
        const projectConditon = (initParamObject && initParamObject.projectId) ? 'Projects.OurId="' + initParamObject.projectId + '"' : '1';

        const sql = 'SELECT  Projects_Entities.ProjectId, \n \t' +
            'Projects_Entities.EntityId, \n \t' +
            'Projects_Entities.ProjectRole, \n \t' +
            'Entities.Name, \n \t' +
            'Entities.Address, \n \t' +
            'Entities.TaxNumber, \n \t' +
            'Entities.Www, \n \t' +
            'Entities.Email, \n \t' +
            'Entities.Phone, \n \t' +
            'Entities.Fax \n' +
            'FROM Projects_Entities \n' +
            'JOIN Projects ON Projects_Entities.ProjectId = Projects.Id \n' +
            'JOIN Entities ON Projects_Entities.EntityId=Entities.Id \n' +
            'WHERE ' + projectConditon + ' \n' +
            'ORDER BY Projects_Entities.ProjectRole, Entities.Name';
        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);

        return this.processProjectEntityAssociations(result);
    }

    private static processProjectEntityAssociations(result: any[]) {
        let newResult: ProjectEntity[] = [];

        for (const row of result) {
            const item = new ProjectEntity({
                projectRole: row.ProjectRole,
                _project: {
                    id: row.ProjectId
                },
                _entity: new Entity({
                    id: row.EntityId,
                    name: row.Name,
                    address: row.Address,
                    taxNumber: row.TaxNumber,
                    www: row.Www,
                    email: row.Email,
                    phone: row.Phone,
                    fax: row.Fax
                })
            });
            newResult.push(item);
        }
        return newResult;
    }
}