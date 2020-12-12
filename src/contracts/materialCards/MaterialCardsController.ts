import mysql from "mysql";
import ToolsDb from "../../tools/ToolsDb";


import MaterialCard from "./MaterialCard";
import MaterialCardVersion from "./MaterialCardVersion";
import MaterialCardVersionsController from "./MaterialCardVersionsController";

export default class MaterialCardsController {
  static async getMaterialCardsList(initParamObject: any) {
    const contractConditon = (initParamObject.contractId) ? 'MaterialCards.ContractId="' + initParamObject.contractId + '"' : '1';

    const sql = 'SELECT MaterialCards.Id, \n \t' +
      'MaterialCards.Status, \n \t' +
      'MaterialCards.Name, \n \t' +
      'MaterialCards.Description, \n \t' +
      'MaterialCards.EngineersComment, \n \t' +
      'MaterialCards.EmployersComment, \n \t' +
      'MaterialCards.CreationDate, \n \t' +
      'MaterialCards.Deadline, \n \t' +
      'MaterialCards.LastUpdated, \n \t' +
      'MaterialCards.GdFolderId, \n \t' +
      'MaterialCards.ContractId, \n \t' +
      'Contracts.Id AS ContractId, \n \t' +
      'Contracts.Number AS ContractNumber, \n \t' +
      'Contracts.Name AS ContractName, \n \t' +
      'Contracts.GdFolderId AS ContractGdFolderId, \n \t' +
      'OurContractsData.OurId AS ContractOurId, \n \t' +
      'Contracts.Name AS ContractName, \n \t' +
      'Contracts.Name AS ContractName, \n \t' +
      'Contracts.Name AS ContractName, \n \t' +
      'ContractTypes.Id AS ContractTypeId, \n \t' +
      'ContractTypes.Name AS ContractTypeName, \n \t' +
      'ContractTypes.IsOur AS ContractTypeIsOur, \n \t' +
      'ContractTypes.Id AS ContractTypeDescription, \n \t' +
      'Projects.OurId AS ProjectOurId, \n \t' +
      'Projects.Name AS ProjectName, \n \t' +
      'Projects.GdFolderId AS ProjectGdFolderId, \n \t' +
      'Editors.Id AS EditorId, \n \t' +
      'Editors.Name AS EditorName, \n \t' +
      'Editors.Surname AS EditorSurname, \n \t' +
      'Editors.Email AS EditorEmail, \n \t' +
      'Owners.Id AS OwnerId, \n \t' +
      'Owners.Name AS OwnerName, \n \t' +
      'Owners.Surname AS OwnerSurname, \n \t' +
      'Owners.Email AS OwnerEmail \n' +
      'FROM MaterialCards \n' +
      'JOIN Contracts ON Contracts.Id=MaterialCards.ContractId \n' +
      'JOIN ContractTypes ON ContractTypes.Id = Contracts.TypeId \n' +
      'LEFT JOIN OurContractsData ON OurContractsData.Id = Contracts.Id \n' +
      'JOIN Projects ON Projects.OurId=Contracts.ProjectOurId \n' +
      'JOIN Persons AS Editors ON Editors.Id=MaterialCards.EditorId \n' +
      'JOIN Persons AS Owners ON Owners.Id=MaterialCards.OwnerId \n' +
      'WHERE ' + contractConditon + '\n' +
      'ORDER BY MaterialCards.Id DESC';

    const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
    return this.processMaterialCardsResult(result, initParamObject);


  }

  static async processMaterialCardsResult(result: any[], initParamObject: any) {
    let newResult: [MaterialCard?] = [];
    var versions: any[] = await MaterialCardVersionsController.getMaterialCardVersionsList(initParamObject.contractId);
    for (const row of result) {
      var item = new MaterialCard({
        id: row.Id,
        name: row.Name,
        description: row.Description,
        engineersComment: row.EngineersComment,
        employersComment: row.EmployersComment,
        status: row.Status,
        creationDate: row.CreationDate,
        deadline: row.Deadline,
        gdFolderId: row.GdFolderId,
        contractId: row.ContractId,
        _lastUpdated: row.LastUpdated,
        _contract: {
          id: row.ContractId,
          number: row.ContractNumber,
          name: ToolsDb.sqlToString(row.ContractName),
          gdFolderId: row.ContractGdFolderId,
          ourId: row.ContractOurId,
          _parent: {
            ourId: row.ProjectOurId,
            name: row.ProjectName,
            gdFolderId: row.ProjectGdFolderId
          },
          _type: {
            id: row.ContractTypeId,
            name: row.ContractTypeName,
            description: row.ContractTypeDescription,
            isOur: row.ContractTypeIsOur
          }
        },
        //ostatni edytujący
        _editor: {
          id: row.EditorId,
          name: row.EditorName,
          surname: row.EditorSurname,
          email: row.EditorEmail
        },
        //odpowiedzialny za kolejną akcję
        _owner: {
          id: row.OwnerId,
          name: row.OwnerName,
          surname: row.OwnerSurname,
          email: row.OwnerEmail
        },
        _versions: versions.filter(item => item.parentId == row.Id)
      });
      item._owner._nameSurnameEmail = item._owner.name + ' ' + item._owner.surname + ' ' + item._owner.email;
      newResult.push(item);
    }
    return newResult;
  }
}