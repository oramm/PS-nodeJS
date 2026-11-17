import RouteIdValidator from '../../../../tools/RouteIdValidator';
import { MilestoneDateData } from '../../../../types/types';
import ConsolidationGuard from '../../consolidation/ConsolidationWriteGuardController';
import ToolsDb from '../../../../tools/ToolsDb';
import Sharing from '../../sharing/MilestoneSharingController';
import BaseController from '../../../../controllers/BaseController';
import { UserData } from '../../../../types/sessionTypes';
import { MilestoneParentType } from '../../../../types/types';
import MilestoneDate from './MilestoneDate';
import MilestoneDateRepository, {
    MilestoneDatesSearchParams,
} from './MilestoneDateRepository';
import { ProjectScope } from '../../../../types/sessionTypes';

/**
 * Controller dla MilestoneDate - warstwa orkiestracji
 *
 * Zgodnie z Clean Architecture:
 * - Dziedziczy po BaseController<MilestoneDate, MilestoneDateRepository>
 * - Orkiestruje operacje biznesowe
 * - Deleguje do Repository dla operacji DB
 */
export default class MilestoneDatesController extends BaseController<
    MilestoneDate,
    MilestoneDateRepository
> {

    static async editFromDto(routeId: unknown, dto: MilestoneDateData, user?: UserData) {
        const item = new MilestoneDate({ ...dto, id: RouteIdValidator.positiveId(routeId) });
        if (!user) throw new Error('User data not available in session');
        return this.edit(item, user, (dto as any)._fieldsToUpdate);
    }
    static async deleteFromDto(routeId: unknown, dto: MilestoneDateData, user?: UserData) {
        const item = new MilestoneDate({ ...dto, id: RouteIdValidator.positiveId(routeId) });
        if (!user) throw new Error('User data not available in session');
        await this.delete(item, user);
        return item;
    }
    static async edit(item: MilestoneDate, user?: UserData, fields?: string[]) {
        return Sharing.runExclusive(async () => {
            const id = await Sharing.guardDate(item);
            return ConsolidationGuard.cases([id], [], async () => {
                const result = await ToolsDb.transaction(async conn => {
                    await this.getInstance().repository.editInDb(item, conn, true, fields);
                    await Sharing.touch(id, conn);
                    return item;
                });
                await Sharing.decorate([result]);
                return result;
            });
        });
    }
    static async delete(item: MilestoneDate, user?: UserData) {
        return Sharing.runExclusive(async () => {
            const id = await Sharing.guardDate(item);
            return ConsolidationGuard.cases([id], [], async () => {
                await ToolsDb.transaction(async conn => {
                    await this.getInstance().repository.deleteFromDb(item, conn, true);
                    await Sharing.touch(id, conn);
                });
            });
        });
    }
    private static instance: MilestoneDatesController;

    constructor() {
        super(new MilestoneDateRepository());
    }

    // Singleton pattern
    private static getInstance(): MilestoneDatesController {
        if (!this.instance) {
            this.instance = new MilestoneDatesController();
        }
        return this.instance;
    }

    /**
     * API PUBLICZNE - Pobiera listę MilestoneDates według podanych warunków
     *
     * @param orConditions - Warunki wyszukiwania (OR groups)
     * @param parentType - Typ rodzica: 'CONTRACT' lub 'OFFER'
     * @returns Promise<MilestoneDate[]> - Lista znalezionych MilestoneDates
     */
    static async find(
        orConditions: MilestoneDatesSearchParams[] = [],
        parentType: MilestoneParentType = 'CONTRACT',
        scope?: ProjectScope
    ): Promise<MilestoneDate[]> {
        const instance = this.getInstance();
        return Sharing.runExclusive(async () => {
            const items = await instance.repository.find(orConditions, parentType, scope);
            await Sharing.decorate(items);
            return items;
        });
    }

}
