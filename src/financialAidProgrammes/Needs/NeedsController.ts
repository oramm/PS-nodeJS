import Need from './Need';
import { NeedData } from '../../types/types';
import BaseController from '../../controllers/BaseController';
import NeedRepository from './NeedRepository';
import { NeedSearchParams } from './NeedRepository';
import ToolsDb from '../../tools/ToolsDb';
import { enqueueFinEntityRefresh } from '../../contracts/fidmanSync/FidmanSync';

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
        
        await ToolsDb.transaction(async (conn) => {
            await instance.repository.addInDb(item, conn, true);
            await enqueueFinEntityRefresh(conn, item.clientId);
        });
        console.log(`Need "${item.name}" added`);
        return item;
    };

    static async updateNeed(needData: NeedData, fieldsToUpdate: string[]): Promise<Need> {
        const instance = this.getInstance();
        const item = new Need(needData);
        await ToolsDb.transaction(async (conn) => {
            const oldClientId = await instance.repository.findClientIdInConn(conn, item.id!);
            await instance.repository.editInDb(item, conn, true, fieldsToUpdate);
            const newClientId = await instance.repository.findClientIdInConn(conn, item.id!);
            for (const clientId of new Set([oldClientId, newClientId])) {
                if (clientId != null) await enqueueFinEntityRefresh(conn, clientId);
            }
        });
        console.log(`Need with id ${item.id} updated`);
        return item;
    }

    static async deleteNeed(needData: NeedData): Promise<void> {
        const instance = this.getInstance();
        const item = new Need(needData);
        await ToolsDb.transaction(async (conn) => {
            const clientId = await instance.repository.findClientIdInConn(conn, item.id!);
            await instance.repository.deleteFromDb(item, conn, true);
            if (clientId != null) await enqueueFinEntityRefresh(conn, clientId);
        });
        console.log(`Need with id ${item.id} deleted`);
    }
}
