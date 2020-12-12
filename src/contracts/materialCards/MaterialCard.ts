import ToolsDate from "../../tools/ToolsDate";
import ToolsGd from "../../tools/ToolsGd";
import MaterialCardVersion from "./MaterialCardVersion";

export default class MaterialCard {
    id?: any;
    name?: string;
    description?: string;
    engineersComment?: string;
    employersComment?: string;
    status?: string;
    creationDate?: any;
    deadline?: any;
    _lastUpdated?: any;
    _editor?: any;
    _owner?: any;
    ownerId?: any;
    contractId?: any;
    _contract?: any;
    gdFolderId: string;
    _gdFolderUrl?: string;
    _versions?: MaterialCardVersion[];
    constructor(initParamObject: any) {

        this.id = initParamObject.id;
        if (initParamObject.name) this.name = initParamObject.name;
        if (initParamObject.description) this.description = initParamObject.description;
        if (initParamObject.engineersComment) this.engineersComment = initParamObject.engineersComment;
        if (initParamObject.employersComment) this.employersComment = initParamObject.employersComment;
        this.status = initParamObject.status;
        this.creationDate = initParamObject.creationDate;
        this.creationDate = ToolsDate.dateJsToSql(initParamObject.creationDate);

        this.deadline = initParamObject.deadline;
        this._lastUpdated = initParamObject._lastUpdated;
        this._editor = initParamObject._editor;
        this._owner = initParamObject._owner;
        if (initParamObject._owner)
            this.ownerId = initParamObject._owner.id;
        this._contract = initParamObject._contract;
        if (initParamObject._contract)
            this.contractId = initParamObject.contractId;

        this.gdFolderId = initParamObject.gdFolderId;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(this.gdFolderId);
        this._versions = (initParamObject._versions) ? initParamObject._versions : [];
    }

    setGdFolderName(): string {
        return this.id + ' ' + this.name;
    }
}

