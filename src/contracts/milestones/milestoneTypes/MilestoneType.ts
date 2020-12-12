import ToolsDb from '../../../tools/ToolsDb';

export default class MilestoneType {
    id?: number;
    name: any;
    description: any;
    _isDefault: any;
    isInScrumByDefault: any;
    isUniquePerContract: any;
    _folderNumber: any;
    _contractType: any;

    constructor(initParamObject: any) {
        this.id = initParamObject.id;
        this.name = initParamObject.name;
        if (initParamObject.description)
            this.description = initParamObject.description;
        this._isDefault = initParamObject._isDefault;
        this.isInScrumByDefault = initParamObject.isInScrumByDefault;
        this.isUniquePerContract = initParamObject.isUniquePerContract;
        //potrzebny przy dodawaniu i edycji milestonów do kontraktu - łatwiej wybrać typ znając nr folderu, przy zarządzaniu typami ignorować ten atrybut
        this._folderNumber = initParamObject._folderNumber;
        this._contractType = initParamObject._contractType;
    }
}

