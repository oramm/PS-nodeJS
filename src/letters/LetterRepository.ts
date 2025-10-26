import mysql from 'mysql2/promise';
import ToolsDate from '../tools/ToolsDate';
import ToolsDb from '../tools/ToolsDb';
import { UserData } from '../types/sessionTypes';
import { SystemRoleName } from '../types/sessionTypes';
import { CaseData, ContractData, OfferData, ProjectData } from '../types/types';

type LetterSearchParams = {
    projectId?: string;
    _project?: ProjectData;
    _contract?: ContractData;
    _offer?: OfferData;
    _case?: CaseData;
    searchText?: string;
    contractId?: number;
    offerId?: number;
    milestoneId?: string;
    creationDateFrom?: string;
    creationDateTo?: string;
    statuses?: string[];
};

export default class LetterRepository {
    /**
     * Pobiera listę listów z bazy danych na podstawie warunków wyszukiwania
     * @param orConditions - warunki wyszukiwania połączone operatorem OR
     * @param milestoneParentType - typ rodzica kamienia milowego (CONTRACT lub OFFER)
     * @param userData - dane użytkownika (dla filtrowania EXTERNAL_USER)
     * @returns surowe dane z bazy danych
     */
    async find(
        orConditions: LetterSearchParams[],
        milestoneParentType: 'CONTRACT' | 'OFFER',
        userData: UserData
    ): Promise<any[]> {
        const milestoneParentTypeCondition =
            milestoneParentType === 'CONTRACT'
                ? 'Milestones.ContractId IS NOT NULL'
                : 'Milestones.OfferId IS NOT NULL';

        const sql = `SELECT 
                Letters.Id,
                Letters.IsOur,
                Letters.Number,
                Letters.Description,
                Letters.CreationDate,
                Letters.RegistrationDate,
                Letters.GdDocumentId,
                Letters.GdFolderId,
                Letters.Status,
                Letters.LetterFilesCount,
                Letters.LastUpdated,
                Letters.RelatedLetterNumber,
                Letters.ResponseDueDate,
                Letters.ResponseIKNumber,

                -- Pobieranie danych powiązanego projektu
                Projects.Id AS ProjectId,
                Projects.OurId AS ProjectOurId,
                Projects.GdFolderId AS ProjectGdFolderId,
                Projects.LettersGdFolderId,
    
                -- Pobieranie danych powiązanej oferty
                Offers.Id AS OfferId,
                Offers.Alias AS OfferAlias,
                Offers.Description AS OfferDescription,
                Offers.CityId AS OfferCityId,
    
                -- Pobieranie edytora listu
                LastEventEditor.Id AS LastEventEditorId,
                LastEventEditor.Name AS LastEventEditorName,
                LastEventEditor.Surname AS LastEventEditorSurname,
                LastEventEditor.Email AS LastEventEditorEmail,
    
                -- Pobieranie ostatniego zdarzenia dla listu
                LastLetterEvent.Id AS LastEventId,
                LastLetterEvent.EventType AS LastEventType,
                LastLetterEvent.Comment AS LastEventComment,
                LastLetterEvent.AdditionalMessage AS LastEventAdditionalMessage,
                LastLetterEvent.VersionNumber AS LastEventVersionNumber,
                LastLetterEvent.LastUpdated AS LastEventDate,
                LastLetterEvent.GdFilesJSON AS LastEventGdFilesJSON,
                LastLetterEvent.RecipientsJSON AS LastEventRecipientsJSON,
    
                -- Pobieranie powiązanych encji i spraw
                GROUP_CONCAT(Entities.Name SEPARATOR ', ') AS EntityNames,
                GROUP_CONCAT(Cases.Name SEPARATOR ', ') AS CaseNames,
                GROUP_CONCAT(CaseTypes.Name SEPARATOR ', ') AS CaseTypesNames
    
            FROM Letters
            JOIN Letters_Cases ON Letters_Cases.LetterId = Letters.Id
            JOIN Cases ON Letters_Cases.CaseId = Cases.Id
            JOIN CaseTypes ON Cases.TypeId = CaseTypes.Id
            JOIN Milestones ON Milestones.Id = Cases.MilestoneId
            LEFT JOIN Contracts ON Contracts.Id = Milestones.ContractId
            LEFT JOIN Offers ON Offers.Id = Letters.OfferId
            LEFT JOIN Projects ON Letters.ProjectId = Projects.Id
            JOIN Letters_Entities ON Letters_Entities.LetterId = Letters.Id
            JOIN Entities ON Letters_Entities.EntityId = Entities.Id
    
            -- Podzapytanie wybierające najnowsze zdarzenie dla każdego listu
            LEFT JOIN (
                SELECT LetterId, MAX(Id) AS MaxEventId
                FROM LetterEvents
                GROUP BY LetterId
            ) AS LatestLetterEvents ON LatestLetterEvents.LetterId = Letters.Id
    
            -- Połączenie z tabelą LetterEvents na podstawie najnowszego zdarzenia
            LEFT JOIN LetterEvents AS LastLetterEvent ON LastLetterEvent.Id = LatestLetterEvents.MaxEventId
    
            -- Połączenie z tabelą Persons, aby pobrać dane osoby, która utworzyła zdarzenie
            LEFT JOIN Persons AS LastEventEditor ON LastEventEditor.Id = LastLetterEvent.EditorId
            ${this.makeUserJoinCondition(
                userData
            )} -- Dodawanie warunku dla EXTERNAL-USER
            WHERE ${ToolsDb.makeOrGroupsConditions(
                orConditions,
                this.makeAndConditions.bind(this)
            )}
            AND ${milestoneParentTypeCondition}
            GROUP BY Letters.Id
            ORDER BY Letters.RegistrationDate DESC, Letters.CreationDate DESC;`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return result;
    }

    /**
     * Dodaje warunek JOIN dla użytkowników EXTERNAL_USER
     */
    private makeUserJoinCondition(userData: UserData): string {
        if (userData.systemRoleName !== SystemRoleName.EXTERNAL_USER) return '';
        return `JOIN Persons_Contracts ON Persons_Contracts.ContractId = Contracts.Id
                AND Persons_Contracts.PersonId = ${userData.enviId}`;
    }

    /**
     * Tworzy warunek wyszukiwania po tekście
     */
    private makeSearchTextCondition(searchText: string | undefined): string {
        if (!searchText) return '1';
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(Letters.Description LIKE ?
                    OR Letters.Number LIKE ?
                    OR Cases.Name LIKE ?
                    OR CaseTypes.Name LIKE ?
                    OR Offers.Alias LIKE ?
                    OR Offers.Description LIKE ?
                    OR Entities.Name LIKE ?)`,
                [
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                ]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    /**
     * Tworzy warunki AND dla pojedynczej grupy parametrów wyszukiwania
     */
    private makeAndConditions(searchParams: LetterSearchParams): string {
        const projectOurId =
            searchParams._project?.ourId || searchParams.projectId;
        const contractId =
            searchParams._contract?.id || searchParams.contractId;
        const offerId = searchParams._offer?.id || searchParams.offerId;
        const caseId = searchParams._case?.id;

        const projectCondition = projectOurId
            ? mysql.format(`Projects.OurId = ? `, [projectOurId])
            : '1';

        const contractCondition = contractId
            ? mysql.format(`Contracts.Id = ? `, [contractId])
            : '1';

        const offerCondition = offerId
            ? mysql.format(`Offers.Id = ? `, [offerId])
            : '1';

        const milestoneCondition = searchParams.milestoneId
            ? mysql.format(`Milestones.Id = ? `, [searchParams.milestoneId])
            : '1';

        const caseCondition = caseId
            ? mysql.format(`Cases.Id = ? `, [caseId])
            : '1';

        const creationDateFromCondition = searchParams.creationDateFrom
            ? mysql.format(`Letters.CreationDate >= ? `, [
                  ToolsDate.dateDMYtoYMD(searchParams.creationDateFrom),
              ])
            : '1';

        const creationDateToCondition = searchParams.creationDateTo
            ? mysql.format(`Letters.CreationDate <= ? `, [
                  searchParams.creationDateTo,
              ])
            : '1';

        const statusesCondition =
            searchParams.statuses && searchParams.statuses.length > 0
                ? mysql.format(`Letters.Status IN (?)`, [searchParams.statuses])
                : '1';

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText?.toString()
        );

        const conditions = `${projectCondition} 
            AND ${contractCondition} 
            AND ${milestoneCondition}
            AND ${caseCondition}
            AND ${creationDateFromCondition}
            AND ${creationDateToCondition}
            AND ${statusesCondition}
            AND ${searchTextCondition} 
            AND ${offerCondition}`;
        return conditions;
    }

    /**
     * Dodaje wpisy APPROVED do listów, które nie mają jeszcze takiego wpisu
     */
    async autoApprove(): Promise<void> {
        const sql = `
            INSERT INTO LetterEvents (LetterId, EditorId, EventType, Comment, AdditionalMessage, VersionNumber, LastUpdated)
            SELECT 
                le.LetterId,
                125 AS EditorId, -- Stały EditorId = 125
                'APPROVED' AS EventType,
                'Pismo zatwierdzone' AS Comment,
                NULL AS AdditionalMessage,
                2 AS VersionNumber, -- Możesz dostosować numer wersji
                TIMESTAMPADD(HOUR, FLOOR(2 + RAND() * 5), le.LastUpdated) AS LastUpdated -- Dodajemy losowe 2-6 godzin
            FROM LetterEvents le
            JOIN Letters l ON le.LetterId = l.Id AND l.IsOur = TRUE -- Warunek: tylko nasze listy
            LEFT JOIN LetterEvents le2 
                ON le.LetterId = le2.LetterId 
                AND le2.EventType = 'APPROVED'
            WHERE le.EventType = 'CREATED' 
            AND le2.Id IS NULL; -- Sprawdzamy, czy 'APPROVED' jeszcze nie istnieje
        `;

        const result = await ToolsDb.executeSQL(sql);
        console.log(`AutoApprove:: dodano ${result.affectedRows} wpisów`);
    }
}

export type { LetterSearchParams };
