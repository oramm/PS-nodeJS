import ToolsDb from '../../../../tools/ToolsDb';

export type CaseEventsSearchParams = {
    milestoneId?: number;
};

export interface CaseEventRawData {
    Id: number;
    IsOur: boolean | null;
    Number: string | null;
    Description: string;
    EventDate: string;
    RegistrationDate: string | null;
    EventGdId: string | null;
    EventGdFolderId: string | null;
    LastUpdated: string;
    ProjectId: string | null;
    CaseId: number;
    ContractId: number;
    EventOwnerId: number;
    EventOwnerName: string;
    EventOwnerSurname: string;
    MeetingId: number | null;
    Name: string | null;
    EventDeadline: string | null;
    NoteProtocolGdId: string | null;
    NoteTitle: string | null;
}

export default class CaseEventRepository {
    /**
     * Wyszukuje zdarzenia sprawy (pisma i ustalenia ze spotkań) według parametrów
     * Repository Layer - zawiera TYLKO logikę SQL
     *
     * UWAGA: Mapowanie do obiektów jest w Controller, ponieważ:
     * - Wymaga wywołania innych Controllers (LetterEntityAssociationsController)
     * - Tworzy różne typy obiektów (Letter lub MeetingArrangement)
     *
     * @param searchParams - Parametry wyszukiwania
     * @returns Promise<CaseEventRawData[]> - Surowe dane z bazy
     */
    async find(
        searchParams: CaseEventsSearchParams = {}
    ): Promise<CaseEventRawData[]> {
        const milestoneCondition = searchParams.milestoneId
            ? 'Milestones.Id=' + searchParams.milestoneId
            : '1';

        const sql =
            'SELECT  Letters.Id, \n \t' +
            'Letters.IsOur, \n \t' +
            'Letters.Number, \n \t' +
            'Letters.Description, \n \t' +
            'Letters.CreationDate AS EventDate,  \n \t' +
            'Letters.RegistrationDate, \n \t' +
            'Letters.GdDocumentId AS EventGdId, \n \t' +
            'Letters.GdFolderId AS EventGdFolderId, \n \t' +
            'Letters.LastUpdated, \n \t' +
            'Letters.ProjectId, \n \t' +
            'Cases.Id AS CaseId, \n \t' +
            'Contracts.Id AS ContractId, \n \t' +
            'Persons.Id AS EventOwnerId, \n \t' +
            'Persons.Name AS EventOwnerName, \n \t' +
            'Persons.Surname AS EventOwnerSurname, \n \t' +
            'NULL AS MeetingId, \n \t' +
            'NULL AS Name, \n \t' +
            'NULL AS EventDeadline, \n \t' +
            'NULL AS NoteProtocolGdId, \n \t' +
            'NULL AS NoteTitle \n' +
            'FROM Letters \n' +
            'JOIN Letters_Cases ON Letters_Cases.LetterId=Letters.Id \n' +
            'JOIN Cases ON Letters_Cases.CaseId=Cases.Id \n' +
            'JOIN Milestones ON Cases.MilestoneId=Milestones.Id \n' +
            'JOIN Contracts ON Milestones.ContractId=Contracts.Id \n' +
            'JOIN Projects ON Contracts.ProjectOurId=Projects.OurId \n' +
            'JOIN Persons ON Letters.EditorId=Persons.Id \n' +
            'WHERE ' +
            milestoneCondition +
            '\n \n' +
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
            'MeetingArrangements.Deadline AS EventDeadline, \n \t' +
            'ContractMeetingNotes.ProtocolGdId AS NoteProtocolGdId, \n \t' +
            'ContractMeetingNotes.Title AS NoteTitle \n' +
            'FROM MeetingArrangements \n' +
            'JOIN Meetings ON MeetingArrangements.MeetingId=Meetings.Id \n' +
            'LEFT JOIN ContractMeetingNotes ON ContractMeetingNotes.MeetingId=MeetingArrangements.MeetingId \n' +
            'JOIN Cases ON MeetingArrangements.CaseId=Cases.Id \n' +
            'JOIN Milestones ON Cases.MilestoneId=Milestones.Id \n' +
            'JOIN Contracts ON Milestones.ContractId=Contracts.Id \n' +
            'JOIN Persons ON MeetingArrangements.OwnerId=Persons.Id \n' +
            'WHERE ' +
            milestoneCondition +
            '\n \n' +
            'ORDER BY EventDate';

        return <CaseEventRawData[]>await ToolsDb.getQueryCallbackAsync(sql);
    }
}
