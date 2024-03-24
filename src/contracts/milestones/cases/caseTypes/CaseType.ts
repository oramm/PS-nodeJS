import BusinessObject from '../../../../BussinesObject';

export default class CaseType extends BusinessObject {
    id?: number;
    name: string;
    folderNumber: string;
    description: string;
    isDefault: boolean;
    isUniquePerMilestone: boolean;
    _milestoneType: any;
    milestoneTypeId: number;
    _processes: any[];
    _folderName: string;

    constructor(initParamObject: any) {
        super({ ...initParamObject, _dbTableName: 'CaseTypes' });
        this.id = initParamObject.id;
        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.folderNumber = initParamObject.folderNumber;
        this.description = initParamObject.description;

        this.isDefault = initParamObject.isDefault;
        this.isUniquePerMilestone = initParamObject.isUniquePerMilestone;
        this._milestoneType = initParamObject._milestoneType;
        this.milestoneTypeId = initParamObject._milestoneType.id;
        this._processes = initParamObject._processes
            ? initParamObject._processes
            : [];
        this._folderName = this.setFolderName();
    }

    setFolderName() {
        return (this._folderName = this.folderNumber + ' ' + this.name);
    }
}
