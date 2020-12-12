import ToolsGd from "../../../../tools/ToolsGd";

export default class Risk {
    id: number;
    name: string;
    cause: string;
    scheduleImpactDescription: string;
    costImpactDescription: string;
    probability: any;
    overallImpact: any;
    _rate: string;
    additionalActionsDescription: any;
    caseId: number;
    projectOurId: string;
    _lastUpdated: any;
    _smallRateLimit: number;
    _bigRateLimit: number;
    _contract: any;
    _parent: any;
    _case: any;
    _gdFolderUrl?: string;

    constructor(initParamObject: any) {
        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.cause = initParamObject.cause;
        this.scheduleImpactDescription = initParamObject.scheduleImpactDescription;
        this.costImpactDescription = initParamObject.costImpactDescription;
        this.probability = initParamObject.probability;
        this.overallImpact = initParamObject.overallImpact;
        this._rate = this.getRate();
        this.additionalActionsDescription = initParamObject.additionalActionsDescription;
        this.caseId = initParamObject.caseId;
        this.projectOurId = initParamObject.projectOurId;
        this._lastUpdated = initParamObject.lastUpdated;
        this._smallRateLimit = 4;
        this._bigRateLimit = 12
        this._contract = (initParamObject._contract) ? initParamObject._contract : {};
        this._parent = (initParamObject._parent) ? initParamObject._parent : {};

        if (initParamObject._case) {
            this._case = initParamObject._case;
            this.caseId = initParamObject._case.id;
            this._gdFolderUrl = ToolsGd.createGdFolderUrl(initParamObject._case.gdFolderId);
        }
        
    }

    getRate() {
        var rateInt = this.probability * this.overallImpact;
        if (rateInt <= 4)
            return 'M';
        if (rateInt < 12)
            return 'S';
        else
            return 'D';
    }

}

