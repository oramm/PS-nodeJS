import ToolsDate from '../../../tools/ToolsDate';
import ToolsDb from '../../../tools/ToolsDb';
import ToolsGd from '../../../tools/ToolsGd';

export default class Case {
    id?: number;
    number?: number;
    _wasChangedToUniquePerMilestone?: boolean;
    name?: string | null;
    description?: string;
    _type?: any;
    typeId?: number;
    _typeFolderNumber_TypeName_Number_Name?: string;
    _displayNumber?: string;
    milestoneId?: number;
    _parent?: any;
    _risk: any;
    _processesInstances?: any[];
    gdFolderId?: string;
    _gdFolderUrl?: string;
    _folderName?: string;

    constructor(initParamObject: any) {
        this.id = initParamObject.id;
        this.number = initParamObject.number;
        if (initParamObject._type.isUniquePerMilestone && this.number) this._wasChangedToUniquePerMilestone = true;

        this.name = (initParamObject.name !== '') ? initParamObject.name : undefined;
        if (initParamObject.description !== undefined) // musi być sprawdzenie undefined, żeby obsłużyć pusty ciąg
            this.description = initParamObject.description;
        if (initParamObject._type) {
            this._type = initParamObject._type;
            if (initParamObject._type.id)
                this.typeId = initParamObject._type.id;

            this.setDisplayNumber(); //ustawia też this._folderName - uruchamia this.setGdFolderName();
            this._typeFolderNumber_TypeName_Number_Name = this._type.folderNumber + ' ' + this._type.name;
            if (!this._type.isUniquePerMilestone)
                this._typeFolderNumber_TypeName_Number_Name += ' | ' + this._displayNumber + ' ' + this.name;
        }
        if (initParamObject.gdFolderId) {
            this.setGdFolderId(initParamObject.gdFolderId);
        }
        if (initParamObject._parent) {
            this.milestoneId = initParamObject._parent.id;
            this._parent = initParamObject._parent;
        }
        this._risk = initParamObject._risk;
        this._processesInstances = (initParamObject._processesInstances) ? initParamObject._processesInstances : [];
    }


    setGdFolderId(gdFolderId: string) {
        this.gdFolderId = gdFolderId;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(gdFolderId);
    }
    setAsUniquePerMilestone() {
        this.number = undefined;
        this.name = null;
    }
    //ustawia numer do wyświetlenia w sytemie na podstawie danych z bazy
    setDisplayNumber() {
        var _displayNumber;
        if (!this.number)
            _displayNumber = '00'
        else if (this.number < 10)
            _displayNumber = '0' + this.number
        else
            _displayNumber = this.number;
        _displayNumber = 'S' + _displayNumber;
        this._displayNumber = _displayNumber;
        this.setGdFolderName();
    }

    setGdFolderName() {
        var caseName = (this.name) ? ' ' + this.name : '';
        this._folderName = this._displayNumber + caseName;

        if (this._wasChangedToUniquePerMilestone)
            this._folderName += ' - przenieś pliki i usuń folder'
        else if (this._type.isUniquePerMilestone)
            this._folderName = this._type.folderNumber + ' ' + this._type.name;
    }

}

