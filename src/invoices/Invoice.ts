import InvoiceItem from "./InvoiceItem";
import ToolsDate from "../tools/ToolsDate";
import ToolsGd from "../tools/ToolsGd";
import BusinessObject from "../BussinesObject";

export default class Invoice extends BusinessObject {
    id?: any;
    number?: any;
    _entity: any;
    entityId?: number;
    description?: string;
    status?: string;
    creationDate?: any;
    issueDate: any;
    sentDate?: any;
    paymentDeadline?: any;
    daysToPay: number;
    _lastUpdated?: any;
    _editor?: any;
    _owner?: any;
    ownerId?: number;
    editorId?: number;
    contractId?: number;

    _contract?: any;
    _items?: InvoiceItem[];
    _project: any;
    gdId?: string | undefined | null;
    _documentOpenUrl?: string;
    _value?: number;

    constructor(initParamObject: any) {
        super({ _dbTableName: 'Invoices' })
        this.daysToPay = initParamObject.daysToPay;
        if (initParamObject) {
            this.id = initParamObject.id;
            this.number = initParamObject.number;
            this.description = initParamObject.description;
            this.status = initParamObject.status;

            initParamObject.creationDate = ToolsDate.dateJsToSql(
                initParamObject.creationDate
            );
            this.issueDate = ToolsDate.dateJsToSql(initParamObject.issueDate);
            this.sentDate = ToolsDate.dateJsToSql(initParamObject.sentDate);

            this.gdId = initParamObject.gdId;
            this.paymentDeadline = ToolsDate.dateJsToSql(
                initParamObject.paymentDeadline
            );
            //tymczasowa linijka do usunięcia po nadpisaniu złych danych
            this.paymentDeadline = this.countPaymentDeadline();
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
            this._contract = initParamObject._contract;
            this.contractId = this._contract.id;
            this._items = initParamObject._items;

            this.setGdIdAndUrl(initParamObject.gdId);
        }
    }

    setGdIdAndUrl(gdId: string | undefined | null) {
        this._documentOpenUrl = (typeof gdId === 'string') ? ToolsGd.createDocumentOpenUrl(gdId) : undefined;
        this.gdId = gdId;
    };

    countPaymentDeadline() {
        if (this.sentDate) {
            var payDay: Date = ToolsDate.addDays(this.sentDate, this.daysToPay);
            return ToolsDate.dateJsToSql(payDay);
        }
    }
}
