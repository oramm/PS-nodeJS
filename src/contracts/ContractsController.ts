import mysql from "mysql";
import Entity from "../entities/Entity";
import Person from "../persons/Person";
import Project from "../projects/Project";
import ToolsDb from '../tools/ToolsDb'
import Contract from "./Contract";

export default class ContractsController {
  static async getContractsList(initParamObject: any) {
    const projectCondition = (initParamObject && initParamObject.projectId) ? 'mainContracts.ProjectOurId="' + initParamObject.projectId + '"' : '1';
    const contractCondition = (initParamObject && initParamObject.contractId) ? 'mainContracts.Id=' + initParamObject.contractId : '1';
    const contractOurIdCondition = (initParamObject && initParamObject.contractOurId) ? 'OurContractsData.OurId="' + initParamObject.contractOurId + '"' : '1';

    const onlyOurContractsCondition = (initParamObject && initParamObject.onlyOur) ? 'OurContractsData.OurId IS NOT NULL' : '1';
    const isArchivedConditon = (initParamObject && initParamObject.isArchived) ? 'mainContracts.Status="Archiwalny"' : 'mainContracts.Status!="Archiwalny"';

    const sql = 'SELECT mainContracts.Id, \n \t' +
      'mainContracts.Alias, \n \t' +
      'mainContracts.Number, \n \t' +
      'mainContracts.Name, \n \t' +
      'mainContracts.ourIdRelated, \n \t' +
      'mainContracts.ProjectOurId, \n \t ' +
      'mainContracts.StartDate, \n \t' +
      'mainContracts.EndDate, \n \t' +
      'mainContracts.Value, \n \t' +
      'mainContracts.Comment, \n \t' +
      'mainContracts.Status, \n \t' +
      'mainContracts.GdFolderId, \n \t' +
      'mainContracts.MeetingProtocolsGdFolderId, \n \t' +
      'mainContracts.MaterialCardsGdFolderId, \n \t' +
      'OurContractsData.OurId, \n \t' +
      'OurContractsData.ManagerId, \n \t' +
      'OurContractsData.AdminId, \n \t' +
      'OurContractsData.ContractURL, \n \t' +
      'Admins.Name AS AdminName, \n \t' +
      'Admins.Surname AS AdminSurname, \n \t' +
      'Admins.Email AS AdminEmail, \n \t' +
      'Managers.Name AS ManagerName, \n \t' +
      'Managers.Surname AS ManagerSurname, \n \t' +
      'Managers.Email AS ManagerEmail, \n \t' +
      'relatedContracts.Id AS RelatedId, \n \t' +
      'relatedContracts.Name AS RelatedName, \n \t' +
      'relatedContracts.GdFolderId AS RelatedGdFolderId, \n \t' +
      'ContractTypes.Id AS TypeId, \n \t' +
      'ContractTypes.Name AS TypeName, \n \t' +
      'ContractTypes.IsOur AS TypeIsOur, \n \t' +
      'ContractTypes.Description AS TypeDescription \n' +
      'FROM Contracts AS mainContracts \n' +
      'LEFT JOIN OurContractsData ON OurContractsData.Id=mainContracts.id \n' +
      'LEFT JOIN Contracts AS relatedContracts ON relatedContracts.Id=(SELECT OurContractsData.Id FROM OurContractsData WHERE OurId=mainContracts.OurIdRelated) \n' +
      'LEFT JOIN ContractTypes ON ContractTypes.Id = mainContracts.TypeId \n' +
      'LEFT JOIN Persons AS Admins ON OurContractsData.AdminId = Admins.Id \n' +
      'LEFT JOIN Persons AS Managers ON OurContractsData.ManagerId = Managers.Id \n' +
      `WHERE ${projectCondition} AND ${contractCondition} AND ${onlyOurContractsCondition} AND ${contractOurIdCondition} AND ${isArchivedConditon}\n` +
      'ORDER BY OurContractsData.OurId DESC, mainContracts.Number';
    const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
    return (initParamObject.onlyKeyData) ? this.processContractsResultKeyData(result, initParamObject) : this.processContractsResult(result, initParamObject);
  }

  private static async processContractsResult(result: any[], initParamObject: any) {
    let newResult: [Contract?] = [];
    let entitiesPerProject: any[] = [];

    if (initParamObject.projectId)
      entitiesPerProject = await this.getContractEntityAssociationsList(initParamObject);
    for (const row of result) {

      var contractors = entitiesPerProject.filter((item: any) =>
        item._contract.id == row.Id && item.contractRole == 'CONTRACTOR'
      );
      var engineers = entitiesPerProject.filter((item: any) =>
        item._contract.id == row.Id && item.contractRole == 'ENGINEER'
      );
      var employers = entitiesPerProject.filter((item: any) =>
        item._contract.id == row.Id && item.contractRole == 'EMPLOYER'
      );
      const item = new Contract({
        id: row.Id,
        alias: row.Alias,
        number: row.Number,
        name: ToolsDb.sqlToString(row.Name),
        //kontrakt powiązany z kontraktem na roboty
        _ourContract: {
          ourId: row.OurIdRelated,
          id: row.RelatedId,
          name: ToolsDb.sqlToString(row.RelatedName),
          gdFolderId: row.RelatedGdFolderId
        },
        projectId: row.ProjectOurId,
        startDate: row.StartDate,
        endDate: row.EndDate,
        value: row.Value,
        comment: ToolsDb.sqlToString(row.Comment),
        status: row.Status,
        gdFolderId: row.GdFolderId,
        meetingProtocolsGdFolderId: row.MeetingProtocolsGdFolderId,
        materialCardsGdFolderId: row.MaterialCardsGdFolderId,
        ourId: row.OurId,
        _manager: new Person({
          id: row.ManagerId,
          name: row.ManagerName,
          surname: row.ManagerSurname,
          email: row.ManagerEmail
        }),
        _admin: new Person({
          id: row.AdminId,
          name: row.AdminName,
          surname: row.AdminSurname,
          email: row.AdminEmail
        }),
        contractUrl: row.ContractURL,
        _type: {
          id: row.TypeId,
          name: row.TypeName,
          description: row.TypeDescription,
          isOur: row.TypeIsOur
        },
        _contractors: contractors.map((item: any) => item._entity),
        _engineers: engineers.map((item: any) => item._entity),
        _employers: employers.map((item: any) => item._entity)
      });
      newResult.push(item);
    }
    return newResult;
  }

  private static processContractsResultKeyData(result: any[], initParamObject: any): [Contract?] {
    let newResult: [Contract?] = [];

    for (const row of result) {
      const item = new Contract({
        id: row.Id,
        alias: row.Alias,
        number: row.Number,
        name: ToolsDb.sqlToString(row.Name),
        //kontrakt powiązany z kontraktem na roboty
        _ourContract: {
          ourId: row.OurIdRelated,
          id: row.RelatedId,
          name: ToolsDb.sqlToString(row.RelatedName),
          gdFolderId: row.RelatedGdFolderId
        },
        projectId: row.ProjectOurId,
        startDate: row.StartDate,
        endDate: row.EndDate,
        value: row.Value,
        comment: ToolsDb.sqlToString(row.Comment),
        status: row.Status,
        gdFolderId: row.GdFolderId,
        meetingProtocolsGdFolderId: row.MeetingProtocolsGdFolderId,
        materialCardsGdFolderId: row.MaterialCardsGdFolderId,
        ourId: row.OurId,
        _manager: {
          id: row.ManagerId,
          name: row.ManagerName,
          surname: row.ManagerSurname,
          email: row.ManagerEmail
        },
        _admin: {
          id: row.AdminId,
          name: row.AdminName,
          surname: row.AdminSurname,
          email: row.AdminEmail
        },
        contractUrl: row.ContractURL,
        _type: {
          id: row.TypeId,
          name: row.TypeName,
          description: row.TypeDescription,
          isOur: row.TypeIsOur
        },
      });

      newResult.push(item);
    }
    return newResult;
  }

  static async getContractEntityAssociationsList(initParamObject: { projectId: string, contractId: string, isArchived: string }) {
    let projectConditon = (initParamObject && initParamObject.projectId) ? 'Contracts.ProjectOurId="' + initParamObject.projectId + '"' : '1';
    let contractConditon = (initParamObject && initParamObject.contractId) ? 'Contracts.Id="' + initParamObject.contractId + '"' : '1';
    const sql = 'SELECT  Contracts_Entities.ContractId, \n \t' +
      'Contracts_Entities.EntityId, \n \t' +
      'Contracts_Entities.ContractRole, \n \t' +
      'Entities.Name, \n \t' +
      'Entities.Address, \n \t' +
      'Entities.TaxNumber, \n \t' +
      'Entities.Www, \n \t' +
      'Entities.Email, \n \t' +
      'Entities.Phone, \n \t' +
      'Entities.Fax \n' +
      'FROM Contracts_Entities \n' +
      'JOIN Contracts ON Contracts_Entities.ContractId = Contracts.Id \n' +
      'JOIN Entities ON Contracts_Entities.EntityId=Entities.Id \n' +
      'LEFT JOIN OurContractsData ON OurContractsData.Id=Contracts.Id \n' +
      'WHERE ' + projectConditon + ' AND ' + contractConditon + ' \n' +
      'ORDER BY Contracts_Entities.ContractRole, Entities.Name';
    const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);

    return this.processContractEntityAssociations(result);
  }

  private static processContractEntityAssociations(result: any[]): [any?] {
    let newResult: [any?] = [];

    for (const row of result) {
      const item = {
        contractRole: row.ContractRole,
        _contract: {
          id: row.ContractId
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
      };

      newResult.push(item);
    }
    return newResult;

  }
}