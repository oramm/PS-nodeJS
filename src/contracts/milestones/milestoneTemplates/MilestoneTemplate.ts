import BusinessObject from '../../../BussinesObject';
import ToolsDb from '../../../tools/ToolsDb';
import MilestoneType from '../milestoneTypes/MilestoneType';

export default class MilestoneTemplate extends BusinessObject {
    id?: number;
    name: string;
    description: string;
    startDateRule?: any;
    endDateRule?: any;
    lastUpdated?: any;
    templateType?: string;
    _contractTypeId: number;
    _folderNumber: string;
    _milestoneType: MilestoneType;
    milestoneTypeId: number;

    constructor(initParamObject: any) {
        super({ ...initParamObject, _dbTableName: 'MilestoneTemplates' });
        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.description = initParamObject.description;
        if (initParamObject.startDateRule)
            this.startDateRule = initParamObject.startDateRule;
        if (initParamObject.endDateRule)
            this.endDateRule = initParamObject.endDateRule;
        initParamObject.endDateRule;
        this.templateType = initParamObject.templateType;
        this.lastUpdated = initParamObject.lastUpdated;
        this._contractTypeId = initParamObject._contractTypeId;
        this._folderNumber = initParamObject._folderNumber;

        this._milestoneType = initParamObject._milestoneType;
        this.milestoneTypeId = initParamObject._milestoneType.id;
    }
}
