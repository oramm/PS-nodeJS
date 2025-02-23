import mysql from 'mysql2/promise';
import ToolsDate from '../tools/ToolsDate';
import ToolsDb from '../tools/ToolsDb';
import LetterCaseAssociationsController, {
    LetterCaseSearchParams,
} from './associations/LetterCaseAssociationsController';
import LetterEntityAssociationsController from './associations/LetterEntityAssociationsController';
import Letter from './Letter';
import OurOldTypeLetter from './OurOldTypeLetter';
import {
    CaseData,
    ContractData,
    LetterData,
    OfferData,
    OurLetterContractData,
    OurLetterOfferData,
    OurOfferData,
    ProjectData,
} from '../types/types';
import OurLetterContract from './OurLetterContract';
import LetterCase from './associations/LetterCase';
import LetterEntity from './associations/LetterEntity';
import IncomingLetterOffer from './IncomingLetterOffer';
import IncomingLetterContract from './IncomingLetterContract';
import OurLetterOffer from './OurLetterOffer';
import LetterEvent from './letterEvent/LetterEvent';

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
};

export default class LettersController {
    static async getLettersList(
        orConditions: LetterSearchParams[],
        milestoneParentType: 'CONTRACT' | 'OFFER'
    ) {
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

            WHERE ${ToolsDb.makeOrGroupsConditions(
                orConditions,
                this.makeAndConditions.bind(this)
            )}
            AND ${milestoneParentTypeCondition}
            GROUP BY Letters.Id
            ORDER BY Letters.RegistrationDate, Letters.CreationDate;`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processLettersResult(result, orConditions[0]);
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(Letters.Description LIKE ?
                    OR Letters.Number LIKE ?
                    OR Cases.Name LIKE ?
                    OR CaseTypes.Name LIKE ?
                    OR Letters.Number LIKE ?
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
                    `%${word}%`,
                ]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static makeAndConditions(searchParams: LetterSearchParams) {
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

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText?.toString()
        );

        const conditions = `${projectCondition} 
            AND ${contractCondition} 
            AND ${milestoneCondition}
            AND ${caseCondition}
            AND ${creationDateFromCondition}
            AND ${creationDateToCondition}
            AND ${searchTextCondition} 
            AND ${offerCondition}`;
        return conditions;
    }

    static async processLettersResult(
        rawResult: any[],
        initParamObject: LetterCaseSearchParams
    ) {
        const newResult: Letter[] = [];
        let [_casesAssociationsPerProject, _letterEntitiesPerProject] =
            await Promise.all([
                LetterCaseAssociationsController.getLetterCaseAssociationsList(
                    initParamObject
                ),
                LetterEntityAssociationsController.getLetterEntityAssociationsList(
                    initParamObject
                ),
            ]);
        for (const row of rawResult) {
            const _casesAssociationsPerLetter =
                _casesAssociationsPerProject.filter(
                    (item) => item.letterId == row.Id
                );
            const _letterEntitiesMainPerLetter =
                _letterEntitiesPerProject.filter(
                    (item) =>
                        item.letterId == row.Id && item.letterRole == 'MAIN'
                );
            const _letterEntitiesCcPerLetter = _letterEntitiesPerProject.filter(
                (item) => item.letterId == row.Id && item.letterRole == 'CC'
            );
            const ProperLetterType = this.getLetterType(row);
            let paramsCreator: Function;

            switch (ProperLetterType) {
                case OurLetterContract:
                case IncomingLetterContract:
                    paramsCreator = this.createLetterContractInitParam;
                    break;
                case OurLetterOffer:
                case IncomingLetterOffer:
                    paramsCreator = this.createLetterOfferInitParam;
                    break;
                case OurOldTypeLetter:
                    paramsCreator =
                        this.createOurOldTypeLetterContractInitParam;
                    break;
                default:
                    throw new Error(
                        'No params creator found for type: ' + ProperLetterType
                    );
            }

            const initParams = paramsCreator(
                row,
                _casesAssociationsPerLetter,
                _letterEntitiesMainPerLetter,
                _letterEntitiesCcPerLetter
            );
            let item = new ProperLetterType(initParams);

            newResult.push(item);
        }
        return newResult;
    }

    private static createLetterInitParam(
        row: any,
        _casesAssociationsPerLetter: LetterCase[],
        _letterEntitiesMainPerLetter: LetterEntity[],
        _letterEntitiesCcPerLetter: LetterEntity[]
    ) {
        const initParam: LetterData = {
            id: row.Id,
            number: row.Number,
            description: ToolsDb.sqlToString(row.Description),
            creationDate: row.CreationDate,
            registrationDate: row.RegistrationDate,
            gdDocumentId: row.GdDocumentId,
            gdFolderId: row.GdFolderId,
            letterFilesCount: row.LetterFilesCount,
            status: row.Status,
            _lastUpdated: row.LastUpdated,

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
        return initParam;
    }

    private static createLetterContractInitParam(
        row: any,
        _casesAssociationsPerLetter: LetterCase[],
        _letterEntitiesMainPerLetter: LetterEntity[],
        _letterEntitiesCcPerLetter: LetterEntity[]
    ) {
        const letterParams = LettersController.createLetterInitParam(
            row,
            _casesAssociationsPerLetter,
            _letterEntitiesMainPerLetter,
            _letterEntitiesCcPerLetter
        );

        const initParam: OurLetterContractData = {
            ...letterParams,
            isOur: row.IsOur,
            _project: <ProjectData>{
                id: row.ProjectId,
                ourId: row.ProjectOurId,
                gdFolderId: row.ProjectGdFolderId,
                lettersGdFolderId: row.LettersGdFolderId,
            },
        };

        return initParam;
    }

    private static createLetterOfferInitParam(
        row: any,
        _casesAssociationsPerLetter: LetterCase[],
        _letterEntitiesMainPerLetter: LetterEntity[],
        _letterEntitiesCcPerLetter: LetterEntity[]
    ) {
        const letterParams = LettersController.createLetterInitParam(
            row,
            _casesAssociationsPerLetter,
            _letterEntitiesMainPerLetter,
            _letterEntitiesCcPerLetter
        );

        const initParam: OurLetterOfferData = {
            ...letterParams,
            isOur: row.IsOur,
            _offer: <OurOfferData>{
                id: row.OfferId,
                alias: row.OfferAlias,
                description: row.OfferDescription,
            },
        };

        return initParam;
    }

    private static createOurOldTypeLetterContractInitParam(
        row: any,
        _casesAssociationsPerLetter: LetterCase[],
        _letterEntitiesMainPerLetter: LetterEntity[],
        _letterEntitiesCcPerLetter: LetterEntity[]
    ) {
        const params = LettersController.createLetterContractInitParam(
            row,
            _casesAssociationsPerLetter,
            _letterEntitiesMainPerLetter,
            _letterEntitiesCcPerLetter
        );

        return { ...params, isOur: true };
    }

    private static getLetterType(row: any) {
        if (row.IsOur && row.Id == row.Number && row.ProjectId)
            return OurLetterContract;
        if (row.IsOur && row.Id != row.Number) return OurOldTypeLetter;
        if (row.IsOur && row.OfferId) return OurLetterOffer;
        if (!row.IsOur && row.ProjectId) return IncomingLetterContract;
        return IncomingLetterOffer;
    }

    /** tworzy obiekt odpowiedniej podklasy Letter na podstawie atrybutów */
    static createProperLetter(initParam: any) {
        let item:
            | OurLetterContract
            | OurOldTypeLetter
            | OurLetterOffer
            | IncomingLetterContract
            | IncomingLetterOffer;
        if (
            initParam.isOur &&
            initParam.id == initParam.number &&
            initParam._project?.id
        ) {
            item = new OurLetterContract(initParam);
            if (initParam._contract)
                item.setContractFromClientData(initParam._contract);
            return item;
        }
        if (initParam.isOur && initParam.id !== initParam.number)
            return new OurOldTypeLetter(initParam);
        if (initParam.isOur && initParam._offer?.id)
            return new OurLetterOffer(initParam);
        if (!initParam.isOur && initParam._project) {
            item = new IncomingLetterContract(initParam);
            if (initParam._contract)
                item.setContractFromClientData(initParam._contract);
            return item;
        }
        return new IncomingLetterOffer(initParam);
    }
    /**
     * Dodaje wpisy APPROVED do listów, które nie mają jeszcze takiego wpisu
     */
    static async autoApprove() {
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
