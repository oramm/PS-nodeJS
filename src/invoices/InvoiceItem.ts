export default class InvoiceItem {
    id?: number;
    description: string;
    unitPrice: number;
    vatTax: any;
    _netValue: number;
    _vatValue: number;
    _grossValue: number;
    _parent: any;
    parentId: number;
    quantity: any;
    _lastUpdated?: any;
    _editor: any;
    editorId: number;

    constructor(initParamObject: any) {
        this.id = initParamObject.id;
        this._parent = initParamObject._parent
        this.parentId = initParamObject._parent.id;
        this.description = initParamObject.description;
        this.quantity = initParamObject.quantity;
        this.unitPrice = initParamObject.unitPrice;
        this.vatTax = initParamObject.vatTax;
        this._netValue = this.getNetValue();
        this._vatValue = this.getVatValue();
        this._grossValue = this.getGrossValue();

        this._lastUpdated = initParamObject._lastUpdated;
        this.editorId = initParamObject._editor.id;
        this._editor = initParamObject._editor;
    }
    getNetValue(): number {
        return Math.round(this.quantity * 100 * this.unitPrice) / 100;
    }

    getVatValue(): number {
        return Math.round(this._netValue * this.vatTax) / 100;
    }

    getGrossValue(): number {
        return this.getNetValue() + this.getVatValue();
    }
}