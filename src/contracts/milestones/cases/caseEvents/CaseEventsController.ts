

import LetterEntityAssociationsController from "../../../../letters/associations/LetterEntityAssociationsController";
import IncomingLetter from "../../../../letters/IncomingLetter";
import OurLetter from "../../../../letters/OurLetter";
import OurOldTypeLetter from "../../../../letters/OurOldTypeLetter";
import Meeting from "../../../../meetings/Meeting";
import MeetingArrangement from "../../../../meetings/meetingArrangements/MeetingArrangement";
import ProcessesController from "../../../../processes/ProcesesController";
import ToolsDb from "../../../../tools/ToolsDb";


export default class CaseEventsController {
    static async getCaseEventsList(initParamObject: any) {
        const milestoneConditon = (initParamObject && initParamObject.milestoneId) ? 'Milestones.Id=' + initParamObject.milestoneId : '1';

        const sql = 'SELECT  Letters.Id, \n \t' +
            'Letters.IsOur, \n \t' +
            'Letters.Number, \n \t' +
            'Letters.Description, \n \t' +
            'Letters.CreationDate AS EventDate,  \n \t' +
            'Letters.RegistrationDate, \n \t' +
            'Letters.DocumentGdId AS EventGdId, \n \t' +
            'Letters.FolderGdId AS EventFolderGdId, \n \t' +
            'Letters.LastUpdated, \n \t' +
            'Letters.ProjectId, \n \t' +
            'Cases.Id AS CaseId, \n \t' +
            'Contracts.Id AS ContractId, \n \t' +
            'Persons.Id AS EventOwnerId, \n \t' +
            'Persons.Name AS EventOwnerName, \n \t' +
            'Persons.Surname AS EventOwnerSurname, \n \t' +
            'NULL AS MeetingId, \n \t' +
            'NULL AS Name, \n \t' +
            'NULL AS EventDeadline \n' +

            'FROM Letters \n' +
            'JOIN Letters_Cases ON Letters_Cases.LetterId=Letters.Id \n' +
            'JOIN Cases ON Letters_Cases.CaseId=Cases.Id \n' +
            'JOIN Milestones ON Cases.MilestoneId=Milestones.Id \n' +
            'JOIN Contracts ON Milestones.ContractId=Contracts.Id \n' +
            'JOIN Projects ON Contracts.ProjectOurId=Projects.OurId \n' +
            'JOIN Persons ON Letters.EditorId=Persons.Id \n' +
            'WHERE ' + milestoneConditon + '\n \n' +

            'UNION \n \n' +

            'SELECT MeetingArrangements.Id, \n \t' +
            'NULL, \n \t' +
            'NULL, \n \t' +
            'MeetingArrangements.Description, \n \t' +
            'Meetings.Date AS EventDate, \n \t' +
            'NULL, \n \t' +
            'Meetings.ProtocolGdId AS EventGdId, \n \t' +
            'NULL, \n \t' +
            'MeetingArrangements.LastUpdated, \n \t' +
            'NULL, \n \t' +
            'Cases.Id AS CaseId, \n \t' +
            'Contracts.Id AS ContractId, \n \t' +
            'Persons.Id AS EventOwnerId, \n \t' +
            'Persons.Name AS OwnerName, \n \t' +
            'Persons.Surname AS OwnerSurname, \n \t' +
            'MeetingArrangements.MeetingId, \n \t' +
            'MeetingArrangements.Name, \n \t' +
            'MeetingArrangements.Deadline AS EventDeadline \n' +
            'FROM MeetingArrangements \n' +
            'JOIN Meetings ON MeetingArrangements.MeetingId=Meetings.Id \n' +
            'JOIN Cases ON MeetingArrangements.CaseId=Cases.Id \n' +
            'JOIN Milestones ON Cases.MilestoneId=Milestones.Id \n' +
            'JOIN Contracts ON Milestones.ContractId=Contracts.Id \n' +
            'JOIN Persons ON MeetingArrangements.OwnerId=Persons.Id \n' +
            'WHERE ' + milestoneConditon + '\n \n' +

            'ORDER BY EventDate';

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processCaseEventsResult(result, initParamObject);
    }

    static async processCaseEventsResult(result: any[], initParamObject: any) {
        let newResult: [any?] = [];

        var _letterEntitiesPerMilestone = await LetterEntityAssociationsController.getLetterEntityAssociationsList(initParamObject);

        for (const row of result) {
            let item: any;
            if (row.Number && !row.Name) {
                var _letterEntitiesMainPerLetter =  _letterEntitiesPerMilestone.filter((item: any) => item.letterId == row.Id && item.letterRole == 'MAIN');
                var _letterEntitiesCcPerLetter = _letterEntitiesPerMilestone.filter((item: any) => item.letterId == row.Id && item.letterRole == 'Cc');

                const letterInitParams = {
                    id: row.Id,
                    isOur: row.IsOur,
                    number: row.Number,
                    description: row.Description,
                    creationDate: row.EventDate,
                    registrationDate: row.RegistrationDate,
                    documentGdId: row.EventGdId,
                    folderGdId: row.EventFolderGdId,
                    _lastUpdated: row.LastUpdated,
                    _entitiesMain: _letterEntitiesMainPerLetter.map((item: any) => item._entity),
                    _entitiesCc: _letterEntitiesCcPerLetter.map((item: any) => item._entity),
                    _editor: {
                        id: row.EventOwnerId,
                        name: row.EventOwnerName,
                        surname: row.EventOwnerSurname,
                    },
                    _project: {
                        id: row.ProjectId,
                    }
                }
                if (letterInitParams.isOur) {
                    if (letterInitParams.id == parseInt(letterInitParams.number))
                        item = new OurLetter(letterInitParams);
                    else
                        item = new OurOldTypeLetter(letterInitParams);
                }
                else
                    item = new IncomingLetter(letterInitParams);
                item._eventType = 'LETTER'
            } else {
                item = new MeetingArrangement({
                    id: row.Id,
                    name: row.Name,
                    description: row.Description,
                    deadline: row.EventDeadline,
                    _lastUpdated: row.LastUpdated,
                    _owner: {
                        id: row.EventOwnerId,
                        name: row.EventOwnerName,
                        surname: row.EventOwnerSurname,
                    },
                    _parent: new Meeting({
                        id: row.MeetingId,
                        date: row.EventDate,
                        protocolGdId: row.EventGdId
                    }),
                    _case: {
                        id: row.CaseId,
                    }
                });
                item._eventType = 'MEETING_ARRENGEMENT';
                item._documentEditUrl = item._parent._documentEditUrl;
            }
            item._case = { id: row.CaseId };

            newResult.push(item);
        }
        return newResult;
    }
}