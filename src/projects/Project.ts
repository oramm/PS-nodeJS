import ToolsDate from '../tools/ToolsDate';
import ToolsDb from '../tools/ToolsDb';
import Entity from '../entities/Entity';
import ProjectEntity from './ProjectEntity';

export default class Project {
  id?: number;
  ourId: string;
  name: string;
  alias: string;
  startDate: string | undefined;
  endDate: string | undefined;
  status: string;
  comment: any;
  financialComment: any;
  investorId: any;
  totalValue: any;
  qualifiedValue: any;
  dotationValue: any;
  gdFolderId: string | undefined;
  _gdFolderUrl: string | undefined;
  lettersGdFolderId: any;
  googleGroupId: any;
  _googleGroupUrl: string | undefined;
  googleCalendarId: any;
  _googleCalendarUrl: any;
  _ourId_Alias: string;
  _lastUpdated: any;
  _engineers?: Entity[];
  _employers?: Entity[];

  constructor(initParamObject: any) {
    this.id = initParamObject.id;
    this.ourId = initParamObject.ourId;
    this.alias = initParamObject.alias;
    this.startDate = ToolsDate.dateJsToSql(initParamObject.startDate);
    this.endDate = ToolsDate.dateJsToSql(initParamObject.endDate);
    this.name = initParamObject.name;
    this.status = initParamObject.status;
    if (initParamObject.comment) this.comment = initParamObject.comment;
    if (initParamObject.financialComment) this.financialComment = initParamObject.financialComment;
    if (initParamObject.investorId) this.investorId = initParamObject.investorId;
    if (initParamObject.totalValue) this.totalValue = initParamObject.totalValue;
    if (initParamObject.qualifiedValue) this.qualifiedValue = initParamObject.qualifiedValue;
    if (initParamObject.dotationValue) this.dotationValue = initParamObject.dotationValue;

    if (initParamObject.gdFolderId) {
      this.gdFolderId = initParamObject.gdFolderId;
      this._gdFolderUrl = 'https://drive.google.com/drive/folders/' + initParamObject.gdFolderId;
    }
    this.lettersGdFolderId = initParamObject.lettersGdFolderId;

    if (initParamObject.googleGroupId) {
      this.googleGroupId = initParamObject.googleGroupId;
      this._googleGroupUrl = 'https://groups.google.com/forum/?hl=pl#!forum/' + this.googleGroupId.replace(/\./gi, '');
    }
    if (initParamObject.googleCalendarId) {
      this.googleCalendarId = initParamObject.googleCalendarId;
      this._googleCalendarUrl = this.makeCalendarUrl();
    }
    this._ourId_Alias = this.ourId
    if (this.alias)
      this._ourId_Alias += ' ' + this.alias;
    this._lastUpdated = initParamObject._lastUpdated;

    //this.setProjectEntityAssociations();

  }


  makeCalendarUrl(): string {
    return 'https://calendar.google.com/calendar/embed?src=' + this.googleCalendarId + '&ctz=Europe%2FWarsaw';
  }

  async setProjectEntityAssociationsFromDb() {
    let sql = 'SELECT  Projects_Entities.ProjectId, \n \t' +
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
      'WHERE Projects.OurId="' + this.ourId + '" \n' +
      'ORDER BY Projects_Entities.ProjectRole, Entities.Name';

    const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
    const allEntitiesInProject = this.processProjectEntityAssociations(result);

    this.setProjectEntityAssociations(allEntitiesInProject);
  }

  async setProjectEntityAssociations(allEntitiesInProject: ProjectEntity[]) {
    this._employers = allEntitiesInProject
      .filter((item: any) => item._project.id === this.id && item.projectRole == 'EMPLOYER')
      .map((item: any) => item._entity);
    this._engineers = allEntitiesInProject
      .filter((item: any) => item._project.id === this.id && item.projectRole == 'ENGINEER')
      .map((item: any) => item._entity);
    if (this._engineers.length === 0)
      this._engineers.push({
        id: 1,
        name: 'ENVI',
        address: 'ul. Jana Brzechwy 3, 49-305 Brzeg',
        taxNumber: '747-191-75-75',
      });
  }
  processProjectEntityAssociations(result: any[]): [any?] {
    let newResult: [ProjectEntity?] = [];

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
