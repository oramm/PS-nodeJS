import ToolsDate from '../../tools/ToolsDate';
import ToolsGd from '../../tools/ToolsGd';


export default class ProcessStepInstance {
    id?: number;
    processInstanceId?: number;
    processStepId?: number;
    status?: string;
    _processStep?: any;
    editorId?: number;
    deadline?: string;
    _lastUpdated?: any;
    _case?: any;
    _documentOpenUrl?: string;
    _ourLetter?: any;
    ourLetterId?: number;
    _extRepoTmpDataObject?: any;

    constructor(initParamObject: any) {

        this.id = initParamObject.id;
        this.processInstanceId = initParamObject.processInstanceId;
        if (initParamObject._processStep) {
            this._processStep = initParamObject._processStep;
            this.processStepId = initParamObject._processStep.id;
        }
        this.status = (initParamObject.status) ? initParamObject.status : 'Nie rozpoczęte';
        if (initParamObject._ourLetter && initParamObject._ourLetter.id) {
            this._ourLetter = initParamObject._ourLetter;
            this.ourLetterId = initParamObject._ourLetter.id;
            this._documentOpenUrl = ToolsGd.createDocumentOpenUrl(initParamObject._ourLetter.documentGdId);
        }
        this.editorId = initParamObject.editorId;

        this.deadline = ToolsDate.dateJsToSql(initParamObject.deadline);

        this._lastUpdated = initParamObject._lastUpdated;
        this._case = initParamObject._case;

    }
}

