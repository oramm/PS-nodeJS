import BusinessObject from '../../../BussinesObject';
import ToolsDate from '../../../tools/ToolsDate';
import ToolsGd from '../../../tools/ToolsGd';
import { ApplicationCallData, FocusAreaData } from '../../../types/types';

export default class ApplicationCall
    extends BusinessObject
    implements ApplicationCallData
{
    id?: number;
    focusAreaId: number;
    _focusArea: FocusAreaData;
    description: string;
    url: string;
    startDate: string | null;
    endDate: string | null;
    status: string;
    gdFolderId!: string;
    _gdFolderUrl?: string;

    constructor(initParamObject: ApplicationCallData) {
        super({ ...initParamObject, _dbTableName: 'ApplicationCalls' });
        if (!initParamObject.focusAreaId && !initParamObject._focusArea.id)
            throw new Error('FocusAreaId is required');
        if (!initParamObject.startDate)
            throw new Error('startDate is required');
        if (!initParamObject.endDate) throw new Error('endDate is required');
        this.focusAreaId = (initParamObject.focusAreaId ??
            initParamObject._focusArea.id) as number;
        this._focusArea = initParamObject._focusArea;
        this.description = initParamObject.description;
        this.url = initParamObject.url;
        this.startDate = ToolsDate.dateJsToSql(
            initParamObject.startDate
        ) as string;
        this.endDate = ToolsDate.dateJsToSql(initParamObject.endDate) as string;
        this.status = initParamObject.status;
        this.setGdFolderIdAndUrl(initParamObject.gdFolderId);
    }

    setGdFolderIdAndUrl(gdFolderId: string) {
        this.gdFolderId = gdFolderId;
        this._gdFolderUrl = ToolsGd.createGdFolderUrl(gdFolderId);
    }
}
