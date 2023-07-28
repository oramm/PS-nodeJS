import InvoiceItem from "./InvoiceItem";
import ToolsDate from "../tools/ToolsDate";
import ToolsGd from "../tools/ToolsGd";
import BusinessObject from "../BussinesObject";
import Setup from "../setup/Setup";
import mysql from 'mysql2/promise';
import ToolsDb from "../tools/ToolsDb";
import InvoiceItemsController from "./InvoiceItemsController";

export default class Invoice extends BusinessObject {
    id?: number;
    number?: string | null;
    _entity: any;
    entityId?: number;
    description?: string;
    status: string = '';
    issueDate: string;
    sentDate?: string | null;
    paymentDeadline?: string | null;
    daysToPay: number;
    _lastUpdated?: string;
    _editor?: any;
    _owner?: any;
    ownerId?: number;
    editorId?: number;
    contractId?: number;

    _contract?: any;
    _items?: InvoiceItem[];
    _project: any;
    gdId?: string | null;
    _documentOpenUrl?: string;
    _totalNetValue?: number;

    constructor(initParamObject: any) {
        super({ _dbTableName: 'Invoices' })
        this.daysToPay = initParamObject.daysToPay;
        this.issueDate = ToolsDate.dateJsToSql(initParamObject.issueDate) as string;
        this.initByStatus(initParamObject.status, initParamObject);

        if (!initParamObject) return;

        this.id = initParamObject.id;

        this.description = initParamObject.description;
        this._lastUpdated = initParamObject._lastUpdated;

        this._entity = initParamObject._entity;
        if (initParamObject._entity)
            this.entityId = initParamObject._entity.id;

        this._editor = initParamObject._editor;
        if (initParamObject._editor)
            this.editorId = initParamObject._editor.id;
        if (initParamObject._owner) {
            this._owner = initParamObject._owner;
            this.ownerId = initParamObject._owner.id;
            this._owner._nameSurnameEmail =
                this._owner.name +
                " " +
                this._owner.surname +
                " " +
                this._owner.email;
        }
        this._totalNetValue = initParamObject._totalNetValue as number | undefined;
        this._contract = initParamObject._contract;
        this.contractId = this._contract.id;
        this._items = initParamObject._items;
    }

    setGdIdAndUrl(gdId: string | undefined | null) {
        this._documentOpenUrl = (typeof gdId === 'string') ? ToolsGd.createDocumentOpenUrl(gdId) : undefined;
        this.gdId = gdId;
    };

    countPaymentDeadline() {
        if (!this.sentDate) return null;
        const payDay: Date = ToolsDate.addDays(this.sentDate, this.daysToPay);
        return ToolsDate.dateJsToSql(payDay);

    }
    /**ustawia parametry faktury w zależności od  statusu */
    initByStatus(status: string, initParamObject: {
        sentDate?: string | null;
        paymentDeadline?: string | null;
        number?: string | null;
        gdId?: string | null;
    }) {

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

    async copyController() {
        ToolsDb.transaction(async (conn: mysql.PoolConnection) => {
            const invoiceCopy = await this.addInDb();
            const originalItems = await InvoiceItemsController.getInvoiceItemsList({ invoiceId: this.id });
            if (!originalItems) return;
            for (const itemData of originalItems) {
                delete itemData.id;
                itemData._parent = invoiceCopy.id;
                let itemCopy = new InvoiceItem(itemData);
                await itemCopy.setEditorId();
                await itemCopy.addInDb();
            }
        });
    }
}