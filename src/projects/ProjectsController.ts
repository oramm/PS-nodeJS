import ToolsDb from '../tools/ToolsDb'
import Project from "./Project";
import Person from '../persons/Person'
import Entity from '../entities/Entity';
import ProjectEntity from './ProjectEntity';
import session from 'express-session';
import { UserData } from '../setup/GAuth2/sessionTypes';


export default class ProjectsController {
    static async getProjectsList(initParamObject: {
        id?: number,
        ourId?: string,
        searchText?: string,
        systemEmail?: string,
        userData: UserData,
        onlyKeyData?: boolean
    }) {
        const projectIdCondition = (initParamObject.id) ? 'Projects.Id=' + initParamObject.id : '1';
        const projectOurIdCondition = (initParamObject.ourId) ? `Projects.OurId LIKE "%${initParamObject.ourId}%"` : '1';

        const searchTextCondition = (initParamObject.searchText) ?
            `Projects.OurId LIKE "%${initParamObject.searchText}%" 
            OR Projects.Number LIKE "%${initParamObject.searchText}%" 
            OR Projects.Alias LIKE "%${initParamObject.searchText}%"`
            : '1';

        //const currentUser = new Person({ systemEmail: initParamObject.systemEmail });
        //const currentUserSystemRole = await currentUser.getSystemRole();
        const currentUserSystemRoleName = initParamObject.userData.systemRoleName;
        if (currentUserSystemRoleName == 'ENVI_EMPLOYEE' || currentUserSystemRoleName == 'ENVI_MANAGER')
            var sql = `SELECT * FROM Projects 
            WHERE ${projectIdCondition}
            AND ${projectOurIdCondition}
            AND ${searchTextCondition}`;

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
                    AND Roles.PersonId = @x := (SELECT Persons.Id FROM Persons WHERE Persons.SystemEmail = "${initParamObject.systemEmail}")
                GROUP BY Projects.Id`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processProjectsResult(result, {});
    }

    private static async processProjectsResult(result: any[], initParamObject: any) {
        let newResult: [Project?] = [];
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
            await item.setProjectEntityAssociations(entitiesPerAllProjects);
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