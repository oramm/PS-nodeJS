import BusinessObject from '../BussinesObject';
import Person from '../persons/Person';
import { PersonData } from '../types/types';

export default class InvoiceItem extends BusinessObject {
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
    _editor: PersonData;
    editorId: number;

    constructor(initParamObject: any) {
        super({ ...initParamObject, _dbTableName: 'InvoiceItems' });
        this.id = initParamObject.id;
        this._parent = initParamObject._parent;
        this.parentId = initParamObject._parent.id;
        this.description = initParamObject.description;
        this.quantity = initParamObject.quantity;
        this.unitPrice = initParamObject.unitPrice;
        this.vatTax = initParamObject.vatTax;
        this._netValue = this.getNetValue();
        this._vatValue = this.getVatValue();
        this._grossValue = this.getGrossValue();

        this._lastUpdated = initParamObject._lastUpdated;
        this._editor = initParamObject._editor;
        this.editorId = initParamObject._editor.id;
    }

    getNetValue(): number {
        return Math.round(this.quantity * 100 * this.unitPrice) / 100;
    }

    getVatValue(): number {
        return Math.round(this._netValue * this.vatTax) / 100;
    }

    getGrossValue(): number {
        const grossValue = this.getNetValue() + this.getVatValue();
        return Math.round(grossValue * 100) / 100;
    }
}
