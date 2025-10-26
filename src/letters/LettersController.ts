import ToolsDb from '../tools/ToolsDb';
import LetterCaseAssociationsController, {
    LetterCaseSearchParams,
} from './associations/LetterCaseAssociationsController';
import LetterEntityAssociationsController from './associations/LetterEntityAssociationsController';
import Letter from './Letter';
import OurOldTypeLetter from './OurOldTypeLetter';
import {
    LetterData,
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
import { UserData } from '../types/sessionTypes';
import LetterRepository, { LetterSearchParams } from './LetterRepository';

export default class LettersController {
    private static instance: LettersController;
    private repository: LetterRepository;

    constructor() {
        this.repository = new LetterRepository();
    }

    // Singleton pattern dla zachowania kompatybilności ze statycznymi metodami
    private static getInstance(): LettersController {
        if (!this.instance) {
            this.instance = new LettersController();
        }
        return this.instance;
    }

    /**
     * Pobiera listę listów na podstawie warunków wyszukiwania
     * @param orConditions - warunki wyszukiwania połączone operatorem OR
     * @param milestoneParentType - typ rodzica kamienia milowego (CONTRACT lub OFFER)
     * @param userData - dane użytkownika
     * @returns lista listów (instancje odpowiednich klas Letter)
     */
    static async find(
        orConditions: LetterSearchParams[],
        milestoneParentType: 'CONTRACT' | 'OFFER',
        userData: UserData
    ): Promise<Letter[]> {
        const instance = this.getInstance();
        // Pobierz surowe dane z bazy przez Repository
        const rawResult = await instance.repository.find(
            orConditions,
            milestoneParentType,
            userData
        );

        // Przetworz wyniki i zwróć instancje odpowiednich klas Letter
        return this.processLettersResult(rawResult, orConditions[0]);
    }

    /**
     * Przetwarza surowe dane z bazy i tworzy instancje odpowiednich klas Letter
     */
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
     * (delegacja do Repository)
     */
    static async autoApprove(): Promise<void> {
        const instance = this.getInstance();
        return instance.repository.autoApprove();
    }
}
