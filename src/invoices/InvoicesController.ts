import Invoice from './Invoice';
import InvoiceRepository, { InvoicesSearchParams } from './InvoiceRepository';
import BaseController from '../controllers/BaseController';
import { InvoiceData } from '../types/types';
import { UserData } from '../types/sessionTypes';
import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import Setup from '../setup/Setup';
import InvoiceItemsController from './InvoiceItemsController';
import PersonsController from '../persons/PersonsController';
import { OAuth2Client } from 'google-auth-library';
import ContractOur from '../contracts/ContractOur';
import ToolsGd from '../tools/ToolsGd';
import InvoiceValidator from './InvoiceValidator';
import { drive_v3 } from 'googleapis';

export type {InvoicesSearchParams};

export default class InvoicesController extends BaseController<
    Invoice, 
    InvoiceRepository
> {
    private static instance: InvoicesController;

    constructor() {
        super(new InvoiceRepository());
    }

    private static getInstance(): InvoicesController {
        if (!this.instance) {
            this.instance = new InvoicesController();
        }
        return this.instance;
    }

    static async find(
        searchParams: InvoicesSearchParams[] = []
    ): Promise<Invoice[]> {
        const instance = this.getInstance();
        return await instance.repository.find(searchParams);
    }
    
    static async addNewInvoice(
        invoiceData: InvoiceData,
    ): Promise<Invoice> {
        const instance = this.getInstance();
        const invoice = new Invoice(invoiceData);
        const validator = new InvoiceValidator(
            new ContractOur(invoice._contract),
            invoice
        );
        await validator.checkValueWithContract(true);

        await instance.create(invoice);
        console.log(`Invoice for contract ${invoice._contract.ourId} added in db`);
        return invoice;
    }

    static async updateInvoice(
        invoiceData: InvoiceData,
        fieldsToUpdate?: string[],
        auth?: OAuth2Client
    ): Promise<Invoice> {
        const instance = this.getInstance();
        const invoice = new Invoice(invoiceData);
        
        if (auth && invoice.gdId && invoice.status?.match(/Na później|Do zrobienia/i)) {
            await ToolsGd.trashFile(auth, invoice.gdId);
            invoice.setGdIdAndUrl(null);
            if (fieldsToUpdate && !fieldsToUpdate.includes('gdId')) {
                fieldsToUpdate.push('gdId');
            }
        }
        await instance.edit(invoice, undefined, undefined, fieldsToUpdate);
        console.log(`Invoice ${invoice.id} updated in db`);
        return invoice;
    }

    static async issueInvoice(
        invoiceData: InvoiceData,
        invoiceFile: Express.Multer.File,
        auth: OAuth2Client
    ): Promise<Invoice> {
        const parentGdFolderId = '1WsNoU0m9BoeVHeb_leAFwtRa94k0CD71';
        const item = new Invoice({ ...invoiceData, status: 'Zrobiona' });
        const instance = this.getInstance();

        if (item.gdId) {
            await ToolsGd.trashFile(auth, item.gdId);
        }
        
        const fileData: drive_v3.Schema$File = await ToolsGd.uploadFileMulter(
            auth,
            invoiceFile,
            undefined,
            parentGdFolderId
        );

        item.setGdIdAndUrl(fileData.id);

        const fieldsToUpdate = ['status', 'gdId'];
        await instance.edit(item, undefined, undefined, fieldsToUpdate);
        
        console.log(`Invoice ${item.number} issued and file uploaded`);
        return item;
    }

    static async updateInvoiceStatus(
        invoiceData: InvoiceData,
        newStatus: string
    ): Promise<Invoice> {        
        const instance = this.getInstance();
        const invoice = new Invoice({ ...invoiceData, status: newStatus });
        await instance.edit(invoice, undefined, undefined, ['status']);
        console.log(`Invoice ${invoice.id} status updated to "${newStatus}" in db`);
        return invoice;
    }

    static async deleteInvoice(
        invoiceData: InvoiceData,
        auth?: OAuth2Client
    ): Promise<{ id: number | undefined }> {
        const instance = this.getInstance();
        const invoice = new Invoice(invoiceData);

        const promises = [
            instance.delete(invoice)
        ];

        if (auth && invoice.gdId) {
            promises.push(ToolsGd.trashFile(auth, invoice.gdId));
        } else if (!auth && invoice.gdId) {
            console.warn(`Invoice ${invoice.id} has a gdId, but no auth client was provided. File will not be deleted from Google Drive.`);
        }

        await Promise.all(promises);

        console.log(`Invoice with id ${invoice.id} deleted`);
        return { id: invoice.id };
    }

    static async copyInvoice(
        invoiceToCopyData: InvoiceData,
        userData: UserData
    ): Promise<Invoice> {
        const item = new Invoice(invoiceToCopyData);
        const validator = new InvoiceValidator(
            new ContractOur(item._contract),
            item
        );
        await validator.checkValueWithContract(true);

        return await ToolsDb.transaction(
            async (conn: mysql.PoolConnection) => {
                console.log(
                    'copyController for invoice',
                    invoiceToCopyData.id
                );

                const invoiceCopyData: InvoiceData = {
                    ...invoiceToCopyData,
                    id: undefined,
                    description: invoiceToCopyData.description
                        ? invoiceToCopyData.description.endsWith(' KOPIA')
                            ? invoiceToCopyData.description
                            : invoiceToCopyData.description + ' KOPIA'
                        : 'KOPIA',
                    status: Setup.InvoiceStatus.FOR_LATER,
                    gdId: null,
                    _documentOpenUrl: undefined,
                    number: null,
                    sentDate: null,
                    paymentDeadline: null,
                };

                const invoiceCopy = await this.addNewInvoice(invoiceCopyData);

                const originalItems = await InvoiceItemsController.find([
                    { invoiceId: invoiceToCopyData.id },
                ]);

                for (const itemData of originalItems) {
                    const newItemData = {
                        ...itemData,
                        id: undefined,
                        _parent: invoiceCopy, // Przypisz do nowo utworzonej faktury
                        _editor:
                            await PersonsController.getPersonFromSessionUserData(
                                userData
                            ),
                    };
                    await InvoiceItemsController.addNewInvoiceItem(newItemData, userData);
                }
                return invoiceCopy;
            }
        );
    }
}
