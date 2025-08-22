import BusinessObject from '../../BussinesObject';
import ToolsGd from '../../tools/ToolsGd';
import { FinancialAidProgrammeData, FocusAreaData } from '../../types/types';

export default class FocusArea extends BusinessObject implements FocusAreaData {
    id?: number;
    financialAidProgrammeId?: number;
    _financialAidProgramme: FinancialAidProgrammeData;
    name: string;
    alias: string;
    description: string;
    gdFolderId!: string;
    _gdFolderUrl?: string;

    constructor(initParamObject: FocusAreaData) {
        super({ ...initParamObject, _dbTableName: 'FocusAreas' });
        this.financialAidProgrammeId =
            initParamObject.financialAidProgrammeId ||
            initParamObject._financialAidProgramme?.id;
        this._financialAidProgramme = initParamObject._financialAidProgramme;
        this.name = initParamObject.name;
        this.alias = initParamObject.alias;
        this.description = initParamObject.description;
        this.setGdFolderIdAndUrl(initParamObject.gdFolderId);
    }

    setGdFolderIdAndUrl(gdFolderId: string) {
        this.gdFolderId = gdFolderId;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(gdFolderId);
    }
}
