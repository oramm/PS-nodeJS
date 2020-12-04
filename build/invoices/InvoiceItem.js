"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var InvoiceItem = /** @class */ (function () {
    function InvoiceItem(initParamObject) {
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
        this.editorId = initParamObject._editor.id;
        this._editor = initParamObject._editor;
    }
    InvoiceItem.prototype.getNetValue = function () {
        return Math.round(this.quantity * 100 * this.unitPrice) / 100;
    };
    InvoiceItem.prototype.getVatValue = function () {
        return Math.round(this._netValue * this.vatTax) / 100;
    };
    InvoiceItem.prototype.getGrossValue = function () {
        return this.getNetValue() + this.getVatValue();
    };
    return InvoiceItem;
}());
exports.default = InvoiceItem;
