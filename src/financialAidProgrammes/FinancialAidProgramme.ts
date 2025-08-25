import BusinessObject from '../BussinesObject';
import { FinancialAidProgrammeData } from '../types/types';
import ToolsGd from '../tools/ToolsGd';

export default class FinancialAidProgramme
    extends BusinessObject
    implements FinancialAidProgrammeData
{
    id?: number;
    name: string;
    alias: string;
    description: string;
    url: string;
    gdFolderId!: string;
    _gdFolderUrl?: string;

    constructor(initParamObject: FinancialAidProgrammeData) {
        super({ ...initParamObject, _dbTableName: 'FinancialAidProgrammes' });
        this.name = initParamObject.name;
        this.alias = initParamObject.alias;
        this.description = initParamObject.description;
        this.url = initParamObject.url;
        this.setGdFolderIdAndUrl(initParamObject.gdFolderId);
    }
    
    setGdFolderIdAndUrl(gdFolderId: string) {
        this.gdFolderId = gdFolderId;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(gdFolderId);
    }
}
