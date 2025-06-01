import InvoiceItem from './InvoiceItem';
import ToolsDate from '../tools/ToolsDate';
import ToolsGd from '../tools/ToolsGd';
import BusinessObject from '../BussinesObject';
import Setup from '../setup/Setup';
import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import InvoiceItemsController from './InvoiceItemsController';
import {
    EntityData,
    InvoiceData,
    OurContractData,
    PersonData,
    ProjectData,
} from '../types/types';
import PersonsController from '../persons/PersonsController';
import { UserData } from '../types/sessionTypes';

export default class Invoice extends BusinessObject implements InvoiceData {
    id?: number;
    number?: string | null;
    _entity: EntityData;
    entityId?: number;
    description?: string;
    status: string = '';
    issueDate: string;
    sentDate?: string | null;
    paymentDeadline?: string | null;
    daysToPay: number;
    _lastUpdated?: string;
    _editor?: PersonData;
    _owner?: PersonData;
    ownerId?: number;
    editorId?: number;
    contractId?: number;

    _contract: OurContractData;
    _items?: InvoiceItem[];
    _project?: ProjectData;
    gdId?: string | null;
    _documentOpenUrl?: string;
    _totalNetValue?: number;
    _totalGrossValue?: number;

    constructor(initParamObject: InvoiceData) {
        super({ ...initParamObject, _dbTableName: 'Invoices' });
        this.daysToPay = initParamObject.daysToPay;
        this.issueDate = ToolsDate.dateJsToSql(
            initParamObject.issueDate
        ) as string;
        this.initByStatus(initParamObject.status, initParamObject);

        this.id = initParamObject.id;
        this.number = initParamObject.number;
        this.description = initParamObject.description;
        this._lastUpdated = initParamObject._lastUpdated;

        this._entity = initParamObject._entity;
        if (initParamObject._entity) this.entityId = initParamObject._entity.id;

        this._editor = initParamObject._editor;
        if (initParamObject._editor) this.editorId = initParamObject._editor.id;
        if (initParamObject._owner?.id) {
            this._owner = initParamObject._owner;
            if (
                !this._owner?.name ||
                !this._owner?.surname ||
                !this._owner?.email ||
                !this._owner?._nameSurnameEmail
            )
                console.log('Invoice owner data is incomplete', this.number);
            //throw new Error('Invoice owner data is incomplete');
            this.ownerId = initParamObject._owner.id;
            this._owner._nameSurnameEmail =
                this._owner?.name +
                ' ' +
                this._owner?.surname +
                ' ' +
                this._owner?.email;
        }
        this._totalNetValue = initParamObject._totalNetValue as number;
        this._contract = initParamObject._contract;
        this.contractId = this._contract.id;
        //this._items = initParamObject._items;
    }

    setGdIdAndUrl(gdId: string | undefined | null) {
        this._documentOpenUrl =
            typeof gdId === 'string'
                ? ToolsGd.createDocumentOpenUrl(gdId)
                : undefined;
        this.gdId = gdId;
    }

    countPaymentDeadline() {
        if (!this.sentDate) return null;
        const payDay: Date = ToolsDate.addDays(this.sentDate, this.daysToPay);
        return ToolsDate.dateJsToSql(payDay);
    }
    /**ustawia parametry faktury w zależności od  statusu */
    initByStatus(
        status: string,
        initParamObject: {
            sentDate?: string | null;
            paymentDeadline?: string | null;
            number?: string | null;
            gdId?: string | null;
        }
    ) {
        if (initParamObject.sentDate) {
            this.sentDate = ToolsDate.dateJsToSql(initParamObject.sentDate);
            this.paymentDeadline = this.countPaymentDeadline();
        }
        this.number = initParamObject.number;
        this.gdId = initParamObject.gdId;

        this.status = status;
        //zeruj pola w zależności od statusu
        switch (status) {
            case Setup.InvoiceStatus.FOR_LATER:
            case Setup.InvoiceStatus.TO_DO:
                this.gdId = null;
                this._documentOpenUrl = undefined;
                this.number = undefined;
                this.sentDate = null;
                this.paymentDeadline = null;
                break;
            case Setup.InvoiceStatus.DONE:
                this.sentDate = null;
                this.paymentDeadline = null;
                break;
            case Setup.InvoiceStatus.TO_CORRECT:
            case Setup.InvoiceStatus.WITHDRAWN:
                this.paymentDeadline = null;
                break;
        }

        this.setGdIdAndUrl(initParamObject.gdId);
    }

    async copyController(userData: UserData) {
        return await ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
            console.log('copyController for invoice', this.id);
            const invoiceCopy = new Invoice({
                ...this,
                id: undefined,
                description: this.description
                    ? this.description.endsWith(' KOPIA')
                        ? this.description
                        : this.description + ' KOPIA'
                    : 'KOPIA',

                status: Setup.InvoiceStatus.FOR_LATER,
                gdId: null,
                number: null,
                sentDate: null,
                paymentDeadline: null,
            });

            await invoiceCopy.addInDb();
            const originalItems =
                await InvoiceItemsController.getInvoiceItemsList([
                    { invoiceId: this.id },
                ]);

            for (const itemData of originalItems) {
                delete itemData.id;
                itemData._parent = invoiceCopy;
                let itemCopy = new InvoiceItem(itemData);
                itemCopy._editor =
                    await PersonsController.getPersonFromSessionUserData(
                        userData
                    );

                itemCopy.editorId = itemCopy._editor.id!;
                console.log('itemCopy editorSet');
                await itemCopy.addInDb();
                console.log('itemCopy added', itemCopy);
            }
            return invoiceCopy;
        });
    }
}
