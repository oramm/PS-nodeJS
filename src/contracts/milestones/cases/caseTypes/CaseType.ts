export default class CaseType {
    id?: number;
    name: string;
    folderNumber: string;
    description: string;
    isDefault: boolean;
    isUniquePerMilestone: boolean;
    _milestoneType: any;
    milestoneTypeId: number;
    _processes: any[];


    constructor(initParamObject: any) {
        this.id = initParamObject.id;
        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.folderNumber = initParamObject.folderNumber;
        this.description = initParamObject.description;

        this.isDefault = initParamObject.isDefault;
        this.isUniquePerMilestone = initParamObject.isUniquePerMilestone;
        this._milestoneType = initParamObject._milestoneType;
        this.milestoneTypeId = initParamObject._milestoneType.id;
        this._processes = (initParamObject._processes) ? initParamObject._processes : [];
    }
}

