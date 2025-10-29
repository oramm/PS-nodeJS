import BusinessObject from '../BussinesObject';
import ToolsDate from '../tools/ToolsDate';
import ToolsGd from '../tools/ToolsGd';
import { OAuth2Client } from 'google-auth-library';
import {
    CaseData,
    ContractData,
    EntityData,
    LetterData,
    LetterEventData,
    PersonData,
} from '../types/types';
import { UserData } from '../types/sessionTypes';
import LetterEvent from './letterEvent/LetterEvent';
import LetterEventsController from './letterEvent/LetterEventsController';
import PersonsController from '../persons/PersonsController';
import Setup from '../setup/Setup';

export default abstract class Letter
    extends BusinessObject
    implements LetterData
{
    id?: number;
    number?: string | number;
    description?: string;
    creationDate?: string;
    registrationDate?: string;
    _documentOpenUrl?: string;
    gdDocumentId?: string | null;
    _gdFolderUrl?: string;
    gdFolderId?: string | null;
    _lastUpdated?: string;
    _cases: CaseData[];
    _entitiesMain: EntityData[];
    _entitiesCc: EntityData[];
    letterFilesCount: number = 0;
    _editor: PersonData;
    _fileOrFolderChanged?: boolean;
    status: string;
    editorId?: number;
    _canUserChangeFileOrFolder?: boolean;
    _documentEditUrl?: string;
    _lastEvent?: LetterEvent | null;
    relatedLetterNumber?: string | null;
    responseDueDate?: string;
    responseIKNumber?: string | null;

    constructor(initParamObject: LetterData) {
        super({ ...initParamObject, _dbTableName: 'Letters' });
        if (!initParamObject.creationDate) {
            throw new Error('creationDate is required');
        }
        if (!initParamObject.registrationDate) {
            throw new Error('registrationDate is required');
        }
        if (!initParamObject._cases) {
            throw new Error('_cases is required');
        }

        this.id = initParamObject.id;
        this.description = initParamObject.description;
        this.number = initParamObject.number;
        this.creationDate = ToolsDate.dateJsToSql(initParamObject.creationDate);
        this.registrationDate = ToolsDate.dateJsToSql(
            initParamObject.registrationDate
        );
        if (initParamObject.gdDocumentId) {
            this._documentOpenUrl = ToolsGd.createDocumentOpenUrl(
                initParamObject.gdDocumentId
            );
            this.gdDocumentId = initParamObject.gdDocumentId;
        }
        if (initParamObject.gdFolderId) {
            this._gdFolderUrl = ToolsGd.createGdFolderUrl(
                initParamObject.gdFolderId
            );
            this.gdFolderId = initParamObject.gdFolderId;
        }
        this._lastUpdated = initParamObject._lastUpdated;
        this._cases = initParamObject._cases;
        this._entitiesMain = initParamObject._entitiesMain
            ? initParamObject._entitiesMain
            : [];
        this._entitiesCc = initParamObject._entitiesCc
            ? initParamObject._entitiesCc
            : [];
        if (initParamObject.letterFilesCount)
            this.letterFilesCount = initParamObject.letterFilesCount;

        this._editor = initParamObject._editor;
        this._canUserChangeFileOrFolder;
        this._fileOrFolderChanged;
        this.status = initParamObject.status;
        this.initLastEvent(initParamObject._lastEvent); //przy nowej ofercie lastEvent jeszcze nie istnieje
        this.relatedLetterNumber = initParamObject.relatedLetterNumber;
        if (initParamObject.responseDueDate)
            this.responseDueDate = initParamObject.responseDueDate;
        this.responseIKNumber = initParamObject.responseIKNumber;
    }

    private initLastEvent(lastEventData: LetterEventData | undefined | null) {
        if (!lastEventData?.letterId) return;
        if (lastEventData) {
            lastEventData.letterId = this.id;
            this._lastEvent = new LetterEvent(lastEventData);
        } else this._lastEvent = null;
    }

    /**
     * Tworzy nowy LetterEvent typu CREATED
     * PUBLIC: wywoływana z LettersController.addNewOurLetter() i addNewIncomingLetter()
     */
    async createNewLetterEvent(userData: UserData) {
        const _editor = await PersonsController.getPersonFromSessionUserData(
            userData
        );

        this._lastEvent = new LetterEvent({
            letterId: this.id as number,
            eventType: Setup.LetterEventType.CREATED,

            _editor,
        });
        await LetterEventsController.addNew(this._lastEvent);
    }

    async appendAttachmentsHandler(
        auth: OAuth2Client,
        files: Express.Multer.File[]
    ): Promise<void> {
        this.letterFilesCount += files.length;
    }

    setContractFromClientData(contract: ContractData) {
        this._cases.map((item) => {
            if (!item._parent) throw new Error('Case must have _parent');
            if (!item._parent._contract)
                throw new Error('Case must have _parent._contract');
            item._parent._contract = contract;
        });
    }

    abstract editLetterGdElements(
        auth: OAuth2Client,
        files: Express.Multer.File[]
    ): Promise<void>;
}
