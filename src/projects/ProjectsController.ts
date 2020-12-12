import ToolsDb from '../tools/ToolsDb'
import Project from "./Project";
import Person from '../persons/Person'
import Entity from '../entities/Entity';
import ProjectEntity from './ProjectEntity';

export default class ProjectsController {
  static async getProjectsList(initParamObject: any) {
    var currentUser = new Person({ systemEmail: initParamObject.systemEmail });
    var currentUserSystemRole: any = <any>await currentUser.getSystemRole();
    if (currentUserSystemRole.name == 'ENVI_EMPLOYEE' || currentUserSystemRole.name == 'ENVI_MANAGER')
      var sql = 'SELECT * FROM Projects';
    else
      sql = 'SELECT  Projects.Id, \n \t' +
        'Projects.OurId, \n \t' +
        'Projects.Name,  \n \t ' +
        'Projects.Alias,  \n \t' +
        'Projects.StartDate,  \n \t' +
        'Projects.EndDate,  \n \t' +
        'Projects.Status,  \n \t' +
        'Projects.Comment,  \n \t' +
        'Projects.FinancialComment,  \n \t' +
        'Projects.InvestorId,  \n \t' +
        'Projects.TotalValue,  \n \t' +
        'Projects.QualifiedValue,  \n \t' +
        'Projects.DotationValue,  \n \t' +
        'Projects.GdFolderId,  \n \t' +
        'Projects.LettersGdFolderId,  \n \t' +
        'Projects.GoogleGroupId,  \n \t' +
        'Projects.GoogleCalendarId,  \n \t' +
        'Projects.LastUpdated \n' +
        'FROM Projects \n' +
        'JOIN Roles ON Roles.ProjectOurId = Projects.OurId \n' +
        'WHERE Roles.PersonId = @x := (SELECT Persons.Id FROM Persons WHERE Persons.SystemEmail = "' + initParamObject.systemEmail + '") \n' +
        'GROUP BY Projects.Id';

    const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
    return this.processProjectsResult(result, {});
  }

  private static async processProjectsResult(result: any[], initParamObject: any) {
    let newResult: [Project?] = [];
    let entitiesPerAllProjects: any = [];
    if (!initParamObject.onlyKeyData)
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

  private static processProjectEntityAssociations(result: any[]): [any?] {
    let newResult: [any?] = [];

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