import BusinessObject from '../../../../BussinesObject';
import { UserData } from '../../../../types/sessionTypes';
import ToolsDate from '../../../../tools/ToolsDate';
import { MilestoneData, MilestoneDateData } from '../../../../types/types';

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

    /**
     * @deprecated Użyj MilestoneDatesController.edit(milestoneDate, userData, fieldsToUpdate) zamiast tego.
     *
     * REFAKTORING: Logika przeniesiona do MilestoneDatesController.edit()
     * Model nie powinien orkiestrować operacji I/O do bazy danych.
     *
     * Migracja:
     * ```typescript
     * // STARE:
     * await milestoneDate.editController(userData, fieldsToUpdate);
     *
     * // NOWE:
     * await MilestoneDatesController.edit(milestoneDate, userData, fieldsToUpdate);
     * ```
     */
    async editController(userData: UserData, fieldsToUpdate?: string[]) {
        return await this.editInDb(undefined, false, fieldsToUpdate);
    }

    /**
     * @deprecated Użyj MilestoneDatesController.delete(milestoneDate, userData) zamiast tego.
     *
     * REFAKTORING: Logika przeniesiona do MilestoneDatesController.delete()
     * Model nie powinien orkiestrować operacji I/O do bazy danych.
     *
     * Migracja:
     * ```typescript
     * // STARE:
     * await milestoneDate.deleteController(userData);
     *
     * // NOWE:
     * await MilestoneDatesController.delete(milestoneDate, userData);
     * ```
     */
    async deleteController(userData: UserData): Promise<void> {
        return await this.deleteFromDb();
    }
}
