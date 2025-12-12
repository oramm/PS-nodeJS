import mysql from 'mysql2/promise';
import ToolsDate from '../tools/ToolsDate';
import ToolsDb from '../tools/ToolsDb';
import { UserData } from '../types/sessionTypes';
import { SystemRoleName } from '../types/sessionTypes';
import { CaseData, ContractData, OfferData, ProjectData } from '../types/types';
import BaseRepository from '../repositories/BaseRepository';
import Letter from './Letter';
import OurLetterContract from './OurLetterContract';
import OurLetterOffer from './OurLetterOffer';
import IncomingLetterContract from './IncomingLetterContract';
import IncomingLetterOffer from './IncomingLetterOffer';
import OurOldTypeLetter from './OurOldTypeLetter';
import LetterEvent from './letterEvent/LetterEvent';
import LetterCaseAssociationsController, {
    LetterCaseSearchParams,
} from './associations/LetterCaseAssociationsController';
import LetterEntityAssociationsController from './associations/LetterEntityAssociationsController';
import LetterCase from './associations/LetterCase';
import LetterEntity from './associations/LetterEntity';

export type LetterSearchParams = {
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

export type LetterFindParams = {
    orConditions: LetterSearchParams[];
    milestoneParentType: 'CONTRACT' | 'OFFER';
    userData: UserData;
};

export default class LetterRepository extends BaseRepository<Letter> {
    constructor() {
        super('Letters');
    }

    /**
     * Pobiera listę pism z bazy danych na podstawie warunków wyszukiwania
     * @param params - obiekt z parametrami wyszukiwania
     * @returns tablica instancji Letter (konkretne podklasy: OurLetterContract, IncomingLetterOffer, etc.)
     */
    async find(params: LetterFindParams): Promise<Letter[]> {
        const { orConditions, milestoneParentType, userData } = params;
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

        const rows: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);

        // Pobierz asocjacje dla wszystkich letterów
        const [_casesAssociationsPerProject, _letterEntitiesPerProject] =
            await Promise.all([
                LetterCaseAssociationsController.find(
                    orConditions[0] as LetterCaseSearchParams
                ),
                LetterEntityAssociationsController.getLetterEntityAssociationsList(
                    orConditions[0] as LetterCaseSearchParams
                ),
            ]);

        // Mapuj każdy wiersz na odpowiednią instancję Letter
        return rows.map((row) =>
            this.mapRowToModelWithContext(
                row,
                _casesAssociationsPerProject,
                _letterEntitiesPerProject
            )
        );
    }

    /**
     * Implementacja abstrakcyjnej metody z BaseRepository (nie używana bezpośrednio)
     */
    protected mapRowToModel(row: any): Letter {
        // Ta metoda nie jest używana w LetterRepository, bo potrzebujemy dodatkowego kontekstu
        // Używamy zamiast tego mapRowToModelWithContext
        throw new Error('Use mapRowToModelWithContext instead');
    }

    /**
     * Mapuje surowe dane z bazy na odpowiednią instancję Letter
     */
    protected mapRowToModelWithContext(
        row: any,
        _casesAssociationsPerProject: any[],
        _letterEntitiesPerProject: any[]
    ): Letter {
        const _casesAssociationsPerLetter = _casesAssociationsPerProject.filter(
            (item) => item.letterId == row.Id
        );
        const _letterEntitiesMainPerLetter = _letterEntitiesPerProject.filter(
            (item) => item.letterId == row.Id && item.letterRole == 'MAIN'
        );
        const _letterEntitiesCcPerLetter = _letterEntitiesPerProject.filter(
            (item) => item.letterId == row.Id && item.letterRole == 'CC'
        );

        // Określ typ Letter na podstawie danych z bazy
        const LetterType = this.getLetterType(row);

        // Przygotuj parametry inicjalizacyjne
        const initParams = this.makeInitParams(
            row,
            _casesAssociationsPerLetter,
            _letterEntitiesMainPerLetter,
            _letterEntitiesCcPerLetter
        );

        // Zwróć nową instancję odpowiedniego typu
        return new LetterType(initParams);
    }

    /**
     * Określa właściwą klasę Letter na podstawie danych z bazy
     * WAŻNE: Ta sama logika co w LettersController.getLetterType()
     */
    private getLetterType(row: any): new (params: any) => Letter {
        // Our Letter Contract (nowy typ - Id == Number)
        if (row.IsOur && row.Id == row.Number && row.ProjectId) {
            return OurLetterContract;
        }
        // Our Letter Contract (stary typ - Id != Number)
        if (row.IsOur && row.Id != row.Number) {
            return OurOldTypeLetter;
        }
        // Our Letter Offer
        if (row.IsOur && row.OfferId) {
            return OurLetterOffer;
        }
        // Incoming Letter Contract
        if (!row.IsOur && row.ProjectId) {
            return IncomingLetterContract;
        }
        // Incoming Letter Offer
        if (!row.IsOur && row.OfferId) {
            return IncomingLetterOffer;
        }

        // Błąd - nieprawidłowe dane (brak ProjectId i OfferId)
        throw new Error(
            `Cannot determine Letter type for Letter ID: ${row.Id}. ` +
                `IsOur: ${row.IsOur}, ProjectId: ${row.ProjectId}, OfferId: ${row.OfferId}`
        );
    }

    /**
     * Przygotowuje parametry inicjalizacyjne dla Letter (routing do odpowiedniej metody)
     */
    private makeInitParams(
        row: any,
        _casesAssociationsPerLetter: LetterCase[],
        _letterEntitiesMainPerLetter: LetterEntity[],
        _letterEntitiesCcPerLetter: LetterEntity[]
    ): any {
        const LetterType = this.getLetterType(row);

        switch (LetterType) {
            case OurLetterContract:
            case IncomingLetterContract:
                return this.createLetterContractInitParam(
                    row,
                    _casesAssociationsPerLetter,
                    _letterEntitiesMainPerLetter,
                    _letterEntitiesCcPerLetter
                );
            case OurLetterOffer:
            case IncomingLetterOffer:
                return this.createLetterOfferInitParam(
                    row,
                    _casesAssociationsPerLetter,
                    _letterEntitiesMainPerLetter,
                    _letterEntitiesCcPerLetter
                );
            case OurOldTypeLetter:
                return this.createOurOldTypeLetterContractInitParam(
                    row,
                    _casesAssociationsPerLetter,
                    _letterEntitiesMainPerLetter,
                    _letterEntitiesCcPerLetter
                );
            default:
                throw new Error(
                    'No params creator found for type: ' + LetterType.name
                );
        }
    }

    /**
     * Tworzy bazowe parametry dla Letter (wspólne dla wszystkich typów)
     */
    private createLetterInitParam(
        row: any,
        _casesAssociationsPerLetter: LetterCase[],
        _letterEntitiesMainPerLetter: LetterEntity[],
        _letterEntitiesCcPerLetter: LetterEntity[]
    ): any {
        return {
            id: row.Id,
            number: row.Number,
            isOur: row.IsOur,
            description: ToolsDb.sqlToString(row.Description),
            creationDate: row.CreationDate,
            registrationDate: row.RegistrationDate,
            gdDocumentId: row.GdDocumentId,
            gdFolderId: row.GdFolderId,
            letterFilesCount: row.LetterFilesCount,
            status: row.Status,
            _lastUpdated: row.LastUpdated,
            relatedLetterNumber: row.RelatedLetterNumber,
            responseDueDate: row.ResponseDueDate,
            responseIKNumber: row.ResponseIKNumber,

            _cases: _casesAssociationsPerLetter.map((item) => item._case),
            _entitiesMain: _letterEntitiesMainPerLetter.map(
                (item) => item._entity
            ),
            _entitiesCc: _letterEntitiesCcPerLetter.map((item) => item._entity),
            _editor: {
                id: row.LastEventEditorId,
                name: row.LastEventEditorName,
                surname: row.LastEventEditorSurname,
            },
            _lastEvent: new LetterEvent({
                id: row.LastEventId,
                letterId: row.Id,
                eventType: row.LastEventType,
                _lastUpdated: row.LastEventDate,
                comment: ToolsDb.sqlToString(row.LastEventComment),
                additionalMessage: ToolsDb.sqlToString(
                    row.LastEventAdditionalMessage
                ),
                versionNumber: row.LastEventVersionNumber,
                _editor: {
                    id: row.LastEventEditorId,
                    name: ToolsDb.sqlToString(row.LastEventEditorName),
                    surname: ToolsDb.sqlToString(row.LastEventEditorSurname),
                    email: ToolsDb.sqlToString(row.LastEventEditorEmail),
                },
                gdFilesJSON: row.LastEventGdFilesJSON,
                recipientsJSON: row.LastEventRecipientsJSON,
            }),
        };
    }

    /**
     * Tworzy parametry dla Letter powiązanego z Contract
     */
    private createLetterContractInitParam(
        row: any,
        _casesAssociationsPerLetter: LetterCase[],
        _letterEntitiesMainPerLetter: LetterEntity[],
        _letterEntitiesCcPerLetter: LetterEntity[]
    ): any {
        const letterParams = this.createLetterInitParam(
            row,
            _casesAssociationsPerLetter,
            _letterEntitiesMainPerLetter,
            _letterEntitiesCcPerLetter
        );

        return {
            ...letterParams,
            _project: {
                id: row.ProjectId,
                ourId: row.ProjectOurId,
                gdFolderId: row.ProjectGdFolderId,
                lettersGdFolderId: row.LettersGdFolderId,
            },
        };
    }

    /**
     * Tworzy parametry dla Letter powiązanego z Offer
     */
    private createLetterOfferInitParam(
        row: any,
        _casesAssociationsPerLetter: LetterCase[],
        _letterEntitiesMainPerLetter: LetterEntity[],
        _letterEntitiesCcPerLetter: LetterEntity[]
    ): any {
        const letterParams = this.createLetterInitParam(
            row,
            _casesAssociationsPerLetter,
            _letterEntitiesMainPerLetter,
            _letterEntitiesCcPerLetter
        );

        return {
            ...letterParams,
            _offer: {
                id: row.OfferId,
                alias: row.OfferAlias,
                description: row.OfferDescription,
            },
        };
    }

    /**
     * Tworzy parametry dla starego typu Letter (OurOldTypeLetter)
     */
    private createOurOldTypeLetterContractInitParam(
        row: any,
        _casesAssociationsPerLetter: LetterCase[],
        _letterEntitiesMainPerLetter: LetterEntity[],
        _letterEntitiesCcPerLetter: LetterEntity[]
    ): any {
        const params = this.createLetterContractInitParam(
            row,
            _casesAssociationsPerLetter,
            _letterEntitiesMainPerLetter,
            _letterEntitiesCcPerLetter
        );

        return { ...params, isOur: true };
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
