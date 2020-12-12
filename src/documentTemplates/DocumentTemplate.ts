import ToolsDb from '../tools/ToolsDb';

export default class DocumentTemplate {
    id?: number;
    name: string;
    description: string;
    gdId: string;
    _contents: any;
    _nameConentsAlias: any;

    constructor(initParamObject: any) {
        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.description = initParamObject.description;
        this.gdId = initParamObject.gdId;
        this._contents = initParamObject._contents;
        this._nameConentsAlias = (initParamObject._contents.alias) ? initParamObject._contents.alias : initParamObject.name;
    }
}

