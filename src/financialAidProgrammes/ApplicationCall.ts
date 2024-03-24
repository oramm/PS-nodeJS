import BusinessObject from '../BussinesObject';
import ToolsDate from '../tools/ToolsDate';
import { ApplicationCallData, FocusAreaData } from '../types/types';

export default class ApplicationCall extends BusinessObject {
    focusAreaId: number;
    _focusArea: FocusAreaData;
    description: string;
    url: string;
    startDate: string | null;
    endDate: string | null;
    status: string;

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
    }
}
