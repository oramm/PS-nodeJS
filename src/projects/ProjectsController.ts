import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb'
import Project from "./Project";
import Entity from '../entities/Entity';
import ProjectEntity from './ProjectEntity';
import { UserData } from '../setup/GAuth2/sessionTypes';


export default class ProjectsController {
    /**pobiera listę projektów
     * @param {Object} searchParams.userData - dane użytkownika zalogowanego do systemu (z sesji)   
     */
    static async getProjectsList(searchParams: {
        userData: UserData,
        id?: number,
        ourId?: string,
        searchText?: string,
        systemEmail?: string,
        onlyKeyData?: boolean
        contractId?: number
    }) {
        const projectIdCondition = searchParams.id
            ? mysql.format('Projects.Id = ?', [searchParams.id])
            : '1';

        const projectOurIdCondition = searchParams.ourId
            ? mysql.format('Projects.OurId LIKE ?', [`%${searchParams.ourId}%`])
            : '1';

        const searchTextCondition = this.makeSearchTextCondition(searchParams.searchText);
        const currentUserSystemRoleName = searchParams.userData.systemRoleName;

        let sql: string;
        if (searchParams.contractId)
            sql = mysql.format(`SELECT * FROM Projects 
                                JOIN Contracts ON Contracts.ProjectOurId=Projects.OurId
                                WHERE Contracts.id=?
                                ORDER BY Projects.OurId ASC`, [searchParams.contractId]);


        else if (['ENVI_EMPLOYEE', 'ENVI_MANAGER'].includes(currentUserSystemRoleName))
            sql = `SELECT * FROM Projects 
            WHERE ${projectIdCondition}
            AND ${projectOurIdCondition}
            AND ${searchTextCondition}
            ORDER BY Projects.OurId ASC`;

        else
            sql = `SELECT  Projects.Id,
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
                JOIN Roles ON Roles.ProjectOurId = Projects.OurId
                WHERE ${projectIdCondition}
                    AND ${projectOurIdCondition}
                    AND ${searchTextCondition}
                    AND Roles.PersonId = @x := (SELECT Persons.Id FROM Persons WHERE Persons.SystemEmail = "${searchParams.systemEmail}")
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
                name: row.Name,
                alias: row.Alias,
                startDate: row.StartDate,
                endDate: row.EndDate,
                status: row.Status,
                comment: row.Comment,
                financialComment: row.FinancialComment,
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