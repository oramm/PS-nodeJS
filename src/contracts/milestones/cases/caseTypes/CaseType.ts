import BusinessObject from '../../../../BussinesObject';

export default class CaseType extends BusinessObject {
    id?: number;
    name: string;
    folderNumber: string;
    description: string;
    isDefault: boolean;
    isUniquePerMilestone: boolean;
    isSubCaseOnly: boolean;
    allowsSubCases: boolean;
    _allowedSubCaseTypeIds: number[];
    _milestoneType: any;
    milestoneTypeId: number;
    _processes: any[];
    _folderName: string;
    gdFolderId?: string;
    _gdFolderUrl?: string;
    _folderPath?: string;

    constructor(initParamObject: any) {
        super({ ...initParamObject, _dbTableName: 'CaseTypes' });
        this.id = initParamObject.id;
        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.folderNumber = initParamObject.folderNumber;
        this.description = initParamObject.description;

        this.isDefault = initParamObject.isDefault;
        this.isUniquePerMilestone = initParamObject.isUniquePerMilestone;
        this.isSubCaseOnly = initParamObject.isSubCaseOnly ?? false;
        this._allowedSubCaseTypeIds = initParamObject._allowedSubCaseTypeIds ?? [];
        this.allowsSubCases = this._allowedSubCaseTypeIds.length > 0;
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
