import mysql from "mysql";
import ToolsDb from "../../../../tools/ToolsDb";
import Case from "../Case";

import Task from "./Task";

export default class TasksController {
  static async getTasksList(initParamObject: any) {
    const contractCondition = (initParamObject && initParamObject.contractId) ? 'Contracts.Id=' + initParamObject.contractId : '1';
    const milestoneCondition = (initParamObject && initParamObject.milestoneId) ? 'Milestones.Id=' + initParamObject.milestoneId : '1';
    const contractStatusCondition = (initParamObject && initParamObject.contractStatusCondition) ? 'Contracts.Status REGEXP "' + initParamObject.contractStatusCondition + '"' : '1';
    const ownerCondition = (initParamObject && initParamObject.ownerCondition) ? 'Owners.Email REGEXP "' + initParamObject.ownerCondition + '"' : '1';

    const sql = `SELECT  Tasks.Id,
              Tasks.Name AS TaskName,
              Tasks.Description AS TaskDescription,
              Tasks.Deadline AS TaskDeadline,
              Tasks.Status AS TaskStatus,
              Tasks.OwnerId,
              Cases.Id AS CaseId,
              Cases.Name AS CaseName,
              Cases.TypeId AS CaseTypeId,
              Cases.GdFolderId AS CaseGdFolderId,
              CaseTypes.Id AS CaseTypeId,
              CaseTypes.Name AS CaseTypeName,
              CaseTypes.IsDefault,
              CaseTypes.IsUniquePerMilestone,
              CaseTypes.MilestoneTypeId,
              CaseTypes.FolderNumber AS CaseTypeFolderNumber,
              Milestones.Id AS MilestoneId,
              Milestones.ContractId,
              Milestones.GdFolderId AS MilestoneGdFolderId,
              MilestoneTypes.Id AS MilestoneTypeId,
              MilestoneTypes.Name AS MilestoneTypeName,
              MilestoneTypes_ContractTypes.FolderNumber AS MilestoneTypeFolderNumber,
              OurContractsData.OurId AS ContractOurId,
              Contracts.Alias AS ContractAlias,
              Contracts.Number AS ContractNumber,
              Owners.Name AS OwnerName,
              Owners.Surname AS OwnerSurname,
              Owners.Email AS OwnerEmail
            FROM Tasks
            JOIN Cases ON Cases.Id=Tasks.CaseId
            LEFT JOIN CaseTypes ON Cases.typeId=CaseTypes.Id
            JOIN Milestones ON Milestones.Id=Cases.MilestoneId
            JOIN MilestoneTypes ON Milestones.TypeId=MilestoneTypes.Id
            JOIN Contracts ON Milestones.ContractId=Contracts.Id
            LEFT JOIN OurContractsData ON OurContractsData.Id=Contracts.Id
            JOIN MilestoneTypes_ContractTypes ON MilestoneTypes_ContractTypes.MilestoneTypeId=Milestones.TypeId AND MilestoneTypes_ContractTypes.ContractTypeId=Contracts.TypeId
            LEFT JOIN Persons AS Owners ON Owners.Id = Tasks.OwnerId
            WHERE ${contractCondition} AND ${milestoneCondition} AND ${contractStatusCondition} AND ${ownerCondition}`;

    const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
    return this.processTasksResult(result);


  }

  static processTasksResult(result: any[]): [Task?] {
    let newResult: [Task?] = [];

    for (const row of result) {
      var item = new Task({
        id: row.Id,
        name: row.TaskName,
        description: row.TaskDescription,
        deadline: row.TaskDeadline,
        status: row.TaskStatus,
        _owner: {
          id: (row.OwnerId) ? row.OwnerId : undefined,
          name: (row.OwnerName) ? row.OwnerName : '',
          surname: (row.OwnerSurname) ? row.OwnerSurname : '',
          email: (row.OwnerEmail) ? row.OwnerEmail : ''
        },
        _parent: new Case({
          id: row.CaseId,
          name: row.CaseName,
          gdFolderId: row.CaseGdFolderId,
          _type: {
            id: row.CaseTypeId,
            name: row.CaseTypeName,
            isDefault: row.IsDefault,
            isUniquePerMilestone: row.isUniquePerMilestone,
            milestoneTypeId: row.MilestoneTypeId,
            folderNumber: row.CaseTypeFolderNumber,
          },
          _parent: {
            id: row.MilestoneId,
            _type: {
              id: row.MilestoneTypeId,
              name: row.MilestoneTypeName,
              _folderNumber: row.MilestoneTypeFolderNumber,
            },
            _parent: {
              ourId: row.ContractOurId,
              number: row.ContractNumber,
              alias: row.ContractAlias
            }
          },
        })
      });
      newResult.push(item);
    }
    return newResult;
  }
}