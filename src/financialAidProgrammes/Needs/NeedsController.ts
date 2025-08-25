import Need from './Need';
import { NeedData } from '../../types/types';
import BaseController from '../../controllers/BaseController';
import NeedRepository from './NeedRepository';
import { NeedSearchParams } from './NeedRepository';

export type { NeedSearchParams };

export default class NeedsController extends BaseController<
    Need,
    NeedRepository
> {
    private static instance: NeedsController;
         
    constructor() {
        super(new NeedRepository());
    }

    private static getInstance(): NeedsController {
        if (!this.instance) {
            this.instance = new NeedsController();
        }
        return this.instance;}

    static async find(
        searchParams: NeedSearchParams[] = []
        ): Promise<Need[]> {
        const instance = this.getInstance();
        return instance.repository.find(searchParams);
    }

    static async addNewNeed(needData: NeedData): Promise<Need> {
        const instance = this.getInstance();
        const item = new Need(needData);
        
        await instance.create(item);
        console.log(`Need "${item.name}" added`);
        return item;
    };

    static async updateNeed(needData: NeedData, fieldsToUpdate: string[]): Promise<Need> {
        const instance = this.getInstance();
        const item = new Need(needData);
        await instance.edit(item, undefined, undefined, fieldsToUpdate);
        console.log(`Need with id ${item.id} updated`);
        return item;
    }

    static async deleteNeed(needData: NeedData): Promise<void> {
        const instance = this.getInstance();
        const item = new Need(needData);
        await instance.delete(item);
        console.log(`Need with id ${item.id} deleted`);
    }
}
