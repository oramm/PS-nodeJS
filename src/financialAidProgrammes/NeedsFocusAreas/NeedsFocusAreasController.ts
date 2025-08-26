import BaseController from '../../controllers/BaseController';
import NeedFocusAreaRepository, { NeedsFocusAreasSearchParams } from './NeedFocusAreaRepository';
import NeedsFocusArea from './NeedFocusArea';
import { NeedsFocusAreasData } from '../../types/types';

export type { NeedsFocusAreasSearchParams };

export default class NeedsFocusAreasController extends BaseController<
    NeedsFocusArea,
    NeedFocusAreaRepository
> {
    private static instance: NeedsFocusAreasController;

    constructor() {
        super(new NeedFocusAreaRepository());
    }

    private static getInstance(): NeedsFocusAreasController {
        if (!this.instance) {
            this.instance = new NeedsFocusAreasController();
        }
        return this.instance;
    }
    
    static async find(
        searchParams: NeedsFocusAreasSearchParams[] = []
    ): Promise<NeedsFocusArea[]> {
        const instance = this.getInstance();
        return await instance.repository.find(searchParams);
    }

    static async addNewNeedFocusArea(needFocusAreaData: NeedsFocusAreasData): Promise<NeedsFocusArea> {
        const instance = this.getInstance();
        const item = new NeedsFocusArea(needFocusAreaData);
        await instance.create(item);
        console.log(`NeedFocusArea (NeedId: ${item.needId}, FocusAreaId: ${item.focusAreaId}) added in db`);
        return item;
    }

    static async updateNeedFocusArea(needFocusAreaData: NeedsFocusAreasData, fieldsToUpdate: string[]): Promise<NeedsFocusArea> {
        const instance = this.getInstance();
        const item = new NeedsFocusArea(needFocusAreaData);
        await instance.edit(item, undefined, undefined, fieldsToUpdate);
        console.log(`NeedFocusArea (NeedId: ${item.needId}, FocusAreaId: ${item.focusAreaId}) updated in db`);
        return item;
    }

    static async deleteNeedFocusArea(needFocusAreaData: NeedsFocusAreasData): Promise<void> {
        const instance = this.getInstance();
        const item = new NeedsFocusArea(needFocusAreaData);
        await instance.delete(item);
        console.log(`NeedFocusArea (NeedId: ${item.needId}, FocusAreaId: ${item.focusAreaId}) deleted from db`);
    }
}
