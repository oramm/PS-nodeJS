import mysql from "mysql";
import ToolsDb from "../../../../../tools/ToolsDb";

export default class RisksReactionsController {
  static async getRisksReactionsList(initParamObject: any) {
    const projectCondition = (initParamObject && initParamObject.projectId) ? 'RisksReactions.ProjectOurId="' + initParamObject.projectId + '"' : '1';
    const contractCondition = (initParamObject && initParamObject.contractId) ? 'Contracts.Id="' + initParamObject.contractId + '"' : '1';

    const sql = 'SELECT  Tasks.Id, \n \t' +
      'Tasks.CaseId, \n \t' +
      'Tasks.Name, \n \t' +
      'Tasks.Description, \n \t ' +
      'Tasks.Deadline, \n \t' +
      'Tasks.Status, \n \t' +
      'Tasks.OwnerId, \n \t' +
      'Tasks.LastUpdated, \n \t' +
      'Contracts.Id AS ContractId, \n \t' +
      'Contracts.Number AS ContractNumber, \n \t' +
      'Contracts.Name AS ContractName, \n \t' +
      'Persons.Name AS OwnerName, \n \t' +
      'Persons.Surname AS OwnerSurname, \n \t' +
      'Persons.Email AS OwnerEmail \n' +
      'FROM Tasks \n' +
      'JOIN Cases ON Cases.Id=Tasks.CaseId \n' +
      'JOIN Milestones ON Milestones.Id=Cases.MilestoneId \n' +
      'JOIN Contracts ON Milestones.ContractId = Contracts.Id \n' +
      'JOIN OurContractsData ON Milestones.ContractId = OurContractsData.Id \n' +
      'LEFT JOIN Persons ON Persons.Id = Tasks.OwnerId \n' +
      'WHERE ' + projectCondition + ' ANY ' + contractCondition;

    const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
    return this.processRisksReactionsResult(result);


  }

  static processRisksReactionsResult(result: any[]): [any?] {
    let newResult: [any?] = [];

    for (const row of result) {
      var item = {
        id: row.Id,
        caseId: row.CaseId,
        name: row.Name,
        description: row.Description,
        deadline: row.Deadline,
        status: row.Status,
        ownerId: row.OwnerId,
        lastUpdated: row.LastUpdated,
        _parent: {
          id: row.CaseId,
        },
        _nameSurnameEmail: ''
      };
      var name = (row.OwnerName) ? row.OwnerName : '';
      var surname = (row.OwnerSurname) ? row.OwnerSurname : '';
      var email = (row.OwnerEmail) ? row.OwnerEmail : '';
      if (name)
        item._nameSurnameEmail = name.trim() + ' ' + surname.trim() + ': ' + email.trim();
      newResult.push(item);
    }
    return newResult;
  }
}