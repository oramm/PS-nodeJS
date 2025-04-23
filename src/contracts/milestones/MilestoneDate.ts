import BusinessObject from '../../BussinesObject';
import { UserData } from '../../types/sessionTypes';
import ToolsDate from '../../tools/ToolsDate';
import { MilestoneData, MilestoneDateData } from '../../types/types';

export default class MilestoneDate
    extends BusinessObject
    implements MilestoneDateData
{
    id?: number;
    milestoneId: number;
    _milestone?: MilestoneData | undefined; //podawać tylko do selecta
    startDate: string;
    endDate: string;
    description?: string | null | undefined;
    lastUpdated?: string;

    constructor(initParamObject: MilestoneDateData) {
        super({ ...initParamObject, _dbTableName: 'MilestoneDates' });
        if (!initParamObject.milestoneId)
            throw new Error('Milestone not defined for dates');

        this.id = initParamObject.id;
        this.milestoneId = initParamObject.milestoneId;
        this._milestone = initParamObject._milestone;
        this.description = initParamObject.description;
        this.startDate = ToolsDate.dateJsToSql(
            initParamObject.startDate
        ) as string;

        this.endDate = ToolsDate.dateJsToSql(initParamObject.endDate) as string;
        this.lastUpdated = initParamObject.lastUpdated;
    }

    async editController(userData: UserData, fieldsToUpdate?: string[]) {
        return await this.editInDb(undefined, false, fieldsToUpdate);
    }

    async deleteController(userData: UserData): Promise<void> {
        return await this.deleteFromDb();
    }
}
