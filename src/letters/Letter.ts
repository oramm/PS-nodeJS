import Person from '../persons/Person';
import { Envi } from '../tools/EnviTypes';
import ToolsDate from '../tools/ToolsDate';
import ToolsDb from '../tools/ToolsDb';
import ToolsGd from '../tools/ToolsGd';

export default abstract class Letter implements Envi.Document {
    public id?: any;
    public isOur: boolean;
    public number?: string | number;
    public description?: string;
    public creationDate?: string;
    public registrationDate?: string;
    public _documentOpenUrl?: string;
    public documentGdId: string;
    _gdFolderUrl?: string;
    folderGdId?: string;
    _lastUpdated?: string;
    _contract?: any;
    _project?: any;
    projectId?: any;
    _cases?: any[];
    _entitiesMain?: any[];
    _entitiesCc?: any[];
    letterFilesCount?: number;
    _editor?: any;
    _fileOrFolderChanged?: boolean;

    editorId?: number;
    _canUserChangeFileOrFolder?: boolean;
    _folderName?: string;
    _documentEditUrl?: string;

    constructor(initParamObject: any) {
        this.id = initParamObject.id;
        this.isOur = initParamObject.isOur;
        this.description = initParamObject.description;
        this.number = initParamObject.number;
        this.creationDate = ToolsDate.dateJsToSql(initParamObject.creationDate);

        this.registrationDate = ToolsDate.dateJsToSql(initParamObject.registrationDate);
        this._documentOpenUrl = ToolsGd.createDocumentOpenUrl(initParamObject.documentGdId);
        this.documentGdId = initParamObject.documentGdId;
        if (initParamObject.folderGdId) {
            this._gdFolderUrl = ToolsGd.createGdFolderUrl(initParamObject.folderGdId);
            this.folderGdId = initParamObject.folderGdId;
        }
        this._lastUpdated = initParamObject._lastUpdated;
        this._contract = initParamObject._contract;
        this._project = initParamObject._project;
        this.projectId = initParamObject._project.id;
        this._cases = initParamObject._cases;
        this._entitiesMain = (initParamObject._entitiesMain) ? initParamObject._entitiesMain : [];
        this._entitiesCc = (initParamObject._entitiesCc) ? initParamObject._entitiesCc : [];
        this.letterFilesCount = initParamObject.letterFilesCount;

        this._editor = initParamObject._editor;
        this._canUserChangeFileOrFolder// = this.canUserChangeFileOrFolder();
        this._fileOrFolderChanged;
    }
}

