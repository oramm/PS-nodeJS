import ToolsDb from "../../tools/ToolsDb";
import MeetingArrangement from "./MeetingArrangement";

export default class MeetingArrangementsController {
    static async getMeetingArrangementsList(initParamObject: any) {
        const projectCondition = (initParamObject && initParamObject.projectOurId) ? 'Contracts.ProjectOurId="' + initParamObject.projectOurId + '"' : '1';
        const contractCondition = (initParamObject && initParamObject.contractId) ? 'Contracts.Id=' + initParamObject.contractId : '1';
        const meetingCondition = (initParamObject && initParamObject.meetingId) ? 'MeetingArrangements.MeetingId=' + initParamObject.meetingId : '1';
        const caseConditon = (initParamObject && initParamObject.caseId) ? 'MeetingArrangements.CaseId=' + initParamObject.caseId : '1';

        var sql = 'SELECT  MeetingArrangements.Id, \n \t' +
            'MeetingArrangements.MeetingId, \n \t' +
            'MeetingArrangements.Name, \n \t' +
            'MeetingArrangements.Description, \n \t' +
            'MeetingArrangements.Deadline, \n \t' +
            'MeetingArrangements.LastUpdated, \n \t' +
            'Cases.Id AS CaseId, \n \t' +
            'Cases.Name AS CaseName, \n \t' +
            'CaseTypes.Id AS CaseTypeId, \n \t' +
            'CaseTypes.Name AS CaseTypeName, \n \t' +
            'CaseTypes.FolderNumber, \n \t' +
            'Milestones.Id AS MilestoneId, \n \t' +
            'Milestones.Name AS MilestoneName, \n \t' +
            'Contracts.Id AS ContractId, \n \t' +
            'Contracts.Number AS ContractNumber, \n \t' +
            'Contracts.Name AS ContractName, \n \t' +
            'CaseTypes.FolderNumber, \n \t' +
            'Persons.Id AS OwnerId, \n \t' +
            'Persons.Name AS OwnerName, \n \t' +
            'Persons.Surname AS OwnerSurname, \n \t' +
            'Persons.Email AS OwnerEmail \n' +
            'FROM MeetingArrangements \n' +
            'JOIN Cases ON MeetingArrangements.CaseId=Cases.Id \n' +
            'JOIN CaseTypes ON Cases.TypeId=CaseTypes.Id \n' +
            'JOIN Milestones ON Cases.MilestoneId=Milestones.Id \n' +
            'JOIN Contracts ON Milestones.ContractId=Contracts.Id \n' +
            'LEFT JOIN Persons ON MeetingArrangements.OwnerId=Persons.Id \n' +
            'WHERE ' + projectCondition + ' AND ' + contractCondition + ' AND ' + caseConditon + ' AND ' + meetingCondition;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processMeetingArrangementsResult(result);


    }

    static processMeetingArrangementsResult(result: any[]): [MeetingArrangement?] {
        let newResult: [MeetingArrangement?] = [];

        for (const row of result) {
            var item = new MeetingArrangement({
                id: row.Id,
                name: row.Name,
                description: row.Description,
                deadline: row.Deadline,
                _lastUpdated: row.LastUpdated,
                _owner: {
                    id: row.OwnerId,
                    name: row.OwnerName,
                    surname: row.OwnerSurname,
                    email: row.OwnerEmail
                },
                _parent: {
                    id: row.MeetingId
                },
                _case: {
                    id: row.CaseId,
                    name: row.CaseName,
                    _type: {
                        id: row.CaseTypeId,
                        name: row.CaseTypeName,
                        folderNumber: row.FolderNumber
                    },
                    _parent: {
                        id: row.MilestoneId,
                        name: row.MilestoneName,
                        _parent: {
                            id: row.ContractId,
                            name: row.ContractName,
                            number: row.ContractNumber
                        }
                    }
                }
            });
            newResult.push(item);
        }
        return newResult;
    }
}