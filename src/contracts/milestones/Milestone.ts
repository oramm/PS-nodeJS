import ToolsDate from '../../tools/ToolsDate';
import ToolsDb from '../../tools/ToolsDb';
import ToolsGd from '../../tools/ToolsGd';

export default class Milestone {
    id?: number;
    _tmpId?: string;
    name?: string;
    _folderNumber?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    typeId?: string;
    _type?: any;
    contractId?: number;
    _parent?: any;
    gdFolderId?: string;
    _gdFolderUrl?: string;
    _folderName?: string;
    isOur?: boolean;
    _FolderNumber_TypeName_Name?: string;

    constructor(initParamObject: any) {

        this.id = initParamObject.id;
        //id tworzone tymczosowo po stronie klienta do obsługi tymczasowego wiersza resultsecie
        this._tmpId = initParamObject._tmpId;
        this.name = initParamObject.name;
        this._folderNumber = initParamObject._folderNumber;
        if (initParamObject.description !== undefined) // musi być sprawdzenie undefined, żeby obsłużyć pusty ciąg
            this.description = initParamObject.description;

        this.startDate = ToolsDate.dateJsToSql(initParamObject.startDate);
        this.endDate = ToolsDate.dateJsToSql(initParamObject.endDate);
        this.status = initParamObject.status;
        if (initParamObject.gdFolderId) {
            this.setGdFolderId(initParamObject.gdFolderId);
        }
        if (initParamObject._type) {
            this.typeId = initParamObject._type.id;
            this._type = initParamObject._type;
            this.setGdFolderName();
            this._FolderNumber_TypeName_Name = initParamObject._type._folderNumber + ' ' + initParamObject._type.name + ' | ' + initParamObject.name;
        }

        if (initParamObject._parent) {
            this.contractId = initParamObject._parent.id;
            this._parent = initParamObject._parent;
        }
    }

    setGdFolderId(gdFolderId: string) {
        this.gdFolderId = gdFolderId;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(gdFolderId);
    }

    setGdFolderName() {
        if (this._type._folderNumber)
            this._folderName = this._type._folderNumber + ' ' + this._type.name;
    }

}

