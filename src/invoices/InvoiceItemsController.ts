import BaseController from '../controllers/BaseController';
import InvoiceItem from './InvoiceItem';
import InvoiceItemRepository, { InvoiceItemsSearchParams } from './InvoiceItemRepository';
import InvoiceItemValidator from './InvoiceItemValidator';
import ContractOur from '../contracts/ContractOur';
import PersonsController from '../persons/PersonsController';
import { UserData } from '../types/sessionTypes';

export type {InvoiceItemsSearchParams};

export default class InvoiceItemsController extends BaseController<
    InvoiceItem, 
    InvoiceItemRepository
>{
    private static instance: InvoiceItemsController;

    constructor() {
        super(new InvoiceItemRepository());
    }

    private static getInstance(): InvoiceItemsController {
        if (!this.instance) {
            this.instance = new InvoiceItemsController();
        }
        return this.instance;
    }

    static async find(
        searchParams: InvoiceItemsSearchParams[] = []
    ): Promise<InvoiceItem[]> {
        const instance = this.getInstance();
        return await instance.repository.find(searchParams);
    }

    static async addNewInvoiceItem(itemData: any, userData: UserData): Promise<InvoiceItem> {
        const instance = this.getInstance();
        
        const editor = await PersonsController.getPersonFromSessionUserData(userData);
        const fullItemData = { ...itemData, _editor: editor };
        
        const item = new InvoiceItem(fullItemData);

        const validator = new InvoiceItemValidator(new ContractOur(item._parent._contract), item);
        await validator.checkValueAgainstContract(true);

        await instance.create(item);
        console.log(`InvoiceItem "${item.description}" added`);
        return item;
    }

    static async updateInvoiceItem(itemData: any, fieldsToUpdate: string[], userData: UserData): Promise<InvoiceItem> {
        const instance = this.getInstance();
        const editor = await PersonsController.getPersonFromSessionUserData(userData);
        const fullItemData = { ...itemData, _editor: editor };
        
        const item = new InvoiceItem(fullItemData);

        const validator = new InvoiceItemValidator(new ContractOur(item._parent._contract), item);
        await validator.checkValueAgainstContract(false);

        await instance.edit(item, undefined, undefined, fieldsToUpdate);
        console.log(`InvoiceItem with id ${item.id} updated`);
        return item;
    }
    
    static async deleteInvoiceItem(itemData: { id: number }): Promise<{ id: number | undefined }> {
        const instance = this.getInstance();
        const item = new InvoiceItem(itemData);
        await instance.delete(item);
        console.log(`InvoiceItem with id ${item.id} deleted`);
        return { id: item.id };
    }
}
