import LetterEntityAssociationsController from '../../../../letters/associations/LetterEntityAssociationsController';
import LettersController from '../../../../letters/LettersController';
import Meeting from '../../../../meetings/Meeting';
import MeetingArrangement from '../../../../meetings/meetingArrangements/MeetingArrangement';
import CaseEventRepository, {
    CaseEventsSearchParams,
    CaseEventRawData,
} from './CaseEventRepository';

/**
 * Controller dla CaseEvent - warstwa aplikacji/serwisu
 * ZGODNIE Z WYTYCZNYMI Clean Architecture:
 * - Orkiestruje operacje (Repository, inne Controllers)
 * - NIE pisze zapytań SQL (→ Repository)
 *
 * UWAGA: Moduł obsługuje tylko odczyt (READ)
 * Mapowanie jest w Controller, ponieważ wymaga:
 * - Wywołania LetterEntityAssociationsController
 * - Tworzenia różnych typów obiektów (Letter lub MeetingArrangement)
 */
export default class CaseEventsController {
    private static instance: CaseEventsController;
    protected repository: CaseEventRepository;

    constructor() {
        this.repository = new CaseEventRepository();
    }

    /**
     * Singleton pattern dla zachowania kompatybilności ze statycznymi metodami
     */
    private static getInstance(): CaseEventsController {
        if (!this.instance) {
            this.instance = new CaseEventsController();
        }
        return this.instance;
    }

    /**
     * Wyszukuje zdarzenia sprawy (pisma i ustalenia ze spotkań)
     * API PUBLICZNE - zgodne z Clean Architecture
     * @param searchParams - Parametry wyszukiwania
     * @returns Promise<any[]> - Lista zdarzeń (Letter lub MeetingArrangement)
     */
    static async find(
        searchParams: CaseEventsSearchParams = {}
    ): Promise<any[]> {
        const instance = this.getInstance();
        const rawData = await instance.repository.find(searchParams);
        return instance.processCaseEventsResult(rawData, searchParams);
    }

    /**
     * Przetwarza surowe dane z bazy na obiekty Letter lub MeetingArrangement
     * Logika mapowania wymaga wywołania innych Controllers
     */
    private async processCaseEventsResult(
        result: CaseEventRawData[],
        initParamObject: CaseEventsSearchParams
    ): Promise<any[]> {
        let newResult: any[] = [];

        const _letterEntitiesPerMilestone =
            await LetterEntityAssociationsController.getLetterEntityAssociationsList(
                initParamObject
            );

        for (const row of result) {
            let item: any;
            if (row.Number && !row.Name) {
                const _letterEntitiesMainPerLetter =
                    _letterEntitiesPerMilestone.filter(
                        (item: any) =>
                            item.letterId == row.Id && item.letterRole == 'MAIN'
                    );
                const _letterEntitiesCcPerLetter =
                    _letterEntitiesPerMilestone.filter(
                        (item: any) =>
                            item.letterId == row.Id && item.letterRole == 'Cc'
                    );

                const letterInitParams = {
                    id: row.Id,
                    isOur: row.IsOur,
                    number: row.Number,
                    description: row.Description,
                    creationDate: row.EventDate,
                    registrationDate: row.RegistrationDate,
                    gdDocumentId: row.EventGdId,
                    gdFolderId: row.EventGdFolderId,
                    _lastUpdated: row.LastUpdated,
                    _entitiesMain: _letterEntitiesMainPerLetter.map(
                        (item: any) => item._entity
                    ),
                    _entitiesCc: _letterEntitiesCcPerLetter.map(
                        (item: any) => item._entity
                    ),
                    _editor: {
                        id: row.EventOwnerId,
                        name: row.EventOwnerName,
                        surname: row.EventOwnerSurname,
                    },
                    _project: {
                        id: row.ProjectId,
                    },
                };
                item = LettersController.createProperLetter(letterInitParams);
                item._eventType = 'LETTER';
            } else {
                item = new MeetingArrangement({
                    id: row.Id,
                    name: row.Name ?? undefined,
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
                        protocolGdId: row.EventGdId,
                    }),
                    _case: {
                        id: row.CaseId,
                    },
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
