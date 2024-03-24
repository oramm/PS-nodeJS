import BusinessObject from '../BussinesObject';
import { Envi } from '../tools/EnviTypes';
import { DocumentTemplateData } from '../types/types';

export default class DocumentTemplate
    extends BusinessObject
    implements Envi.DocumentTemplateData
{
    id?: number;
    name: string;
    description?: string;
    gdId: string;
    _contents: any;
    _nameContentsAlias: string;

    constructor(initParamObject: DocumentTemplateData) {
        super({ ...initParamObject, _dbTableName: 'DocumentTemplates' });
        this.id = initParamObject.id;
        this.name = initParamObject.name;
        this.description = initParamObject.description;
        this.gdId = initParamObject.gdId;
        this._contents = initParamObject._contents;
        this._nameContentsAlias = initParamObject.name;
        if (initParamObject._contents?.alias)
            this._nameContentsAlias += ` => ${initParamObject._contents.alias}`;
    }
}
