import BusinessObject from '../BussinesObject';

export default class DocumentTemplate extends BusinessObject {
    id?: number;
    name: string;
    description: string;
    gdId: string;
    _contents: any;
    _nameContentsAlias: string;

    constructor(initParamObject: any) {
        super({ _dbTableName: 'DocumentTemplates' });
        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.description = initParamObject.description;
        this.gdId = initParamObject.gdId;
        this._contents = initParamObject._contents;
        this._nameContentsAlias = initParamObject.name;
        if (initParamObject._contents.alias)
            this._nameContentsAlias += ` => ${initParamObject._contents.alias}`;
    }
}

