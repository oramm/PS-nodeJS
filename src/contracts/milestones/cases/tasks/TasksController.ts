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


        const sql = 'SELECT  Tasks.Id, \n \t' +
            'Tasks.Name AS TaskName, \n \t' +
            'Tasks.Description AS TaskDescription, \n \t ' +
            'Tasks.Deadline AS TaskDeadline, \n \t' +
            'Tasks.Status AS TaskStatus, \n \t' +
            'Tasks.OwnerId, \n \t' +
            'Cases.Id AS CaseId, \n \t' +
            'Cases.Name AS CaseName, \n \t' +
            'Cases.TypeId AS CaseTypeId, \n \t' +
            'Cases.GdFolderId AS CaseGdFolderId, \n \t' +
            'CaseTypes.Id AS CaseTypeId, \n \t' +
            'CaseTypes.Name AS CaseTypeName, \n \t' +
            'CaseTypes.IsDefault, \n \t' +
            'CaseTypes.IsUniquePerMilestone, \n \t' +
            'CaseTypes.MilestoneTypeId, \n \t' +
            'CaseTypes.FolderNumber AS CaseTypeFolderNumber, \n \t' +
            'Milestones.Id AS MilestoneId, \n \t' +
            'Milestones.ContractId, \n \t' +
            'Milestones.GdFolderId AS MilestoneGdFolderId, \n \t' +
            'MilestoneTypes.Id AS MilestoneTypeId, \n \t' +
            'MilestoneTypes.Name AS MilestoneTypeName, \n \t' +
            'MilestoneTypes_ContractTypes.FolderNumber AS MilestoneTypeFolderNumber, \n \t' +
            'OurContractsData.OurId AS ContractOurId, \n \t' +
            'Contracts.Alias AS ContractAlias, \n \t' +
            'Contracts.Number AS ContractNumber, \n \t' +
            'Owners.Name AS OwnerName, \n \t' +
            'Owners.Surname AS OwnerSurname, \n \t' +
            'Owners.Email AS OwnerEmail \n' +
            'FROM Tasks \n' +
            'JOIN Cases ON Cases.Id=Tasks.CaseId \n' +
            'LEFT JOIN CaseTypes ON Cases.typeId=CaseTypes.Id \n' +
            'JOIN Milestones ON Milestones.Id=Cases.MilestoneId \n' +
            'JOIN MilestoneTypes ON Milestones.TypeId=MilestoneTypes.Id \n' +
            'JOIN Contracts ON Milestones.ContractId=Contracts.Id \n' +
            'LEFT JOIN OurContractsData ON OurContractsData.Id=Contracts.Id \n' +
            'JOIN MilestoneTypes_ContractTypes ON MilestoneTypes_ContractTypes.MilestoneTypeId=Milestones.TypeId AND MilestoneTypes_ContractTypes.ContractTypeId=Contracts.TypeId \n' +
            'LEFT JOIN Persons AS Owners ON Owners.Id = Tasks.OwnerId \n' +
            'WHERE ' + contractCondition + ' AND ' + milestoneCondition + ' AND ' + contractStatusCondition + ' AND ' + ownerCondition;

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