"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var ToolsDate_1 = __importDefault(require("../tools/ToolsDate"));
var ToolsGd_1 = __importDefault(require("../tools/ToolsGd"));
var Invoice = /** @class */ (function () {
    function Invoice(initParamObject) {
        this.daysToPay = initParamObject.daysToPay;
        if (initParamObject) {
            this.id = initParamObject.id;
            this.number = initParamObject.number;
            this.description = initParamObject.description;
            this.status = initParamObject.status;
            initParamObject.creationDate = ToolsDate_1.default.dateJsToSql(initParamObject.creationDate);
            this.issueDate = ToolsDate_1.default.dateJsToSql(initParamObject.issueDate);
            this.sentDate = ToolsDate_1.default.dateJsToSql(initParamObject.sentDate);
            this.gdId = initParamObject.gdId;
            this.paymentDeadline = ToolsDate_1.default.dateJsToSql(initParamObject.paymentDeadline);
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
                this._owner._nameSurnameEmail = this._owner.name + ' ' + this._owner.surname + ' ' + this._owner.email;
            }
            this._contract = initParamObject._contract;
            this.contractId = this._contract.id;
            this._items = initParamObject._items;
            if (initParamObject.gdId) {
                this._documentOpenUrl = ToolsGd_1.default.createDocumentOpenUrl(initParamObject.gdId);
                this.gdId = initParamObject.gdId;
            }
        }
    }
    Invoice.prototype.countPaymentDeadline = function () {
        if (this.sentDate) {
            var payDay = ToolsDate_1.default.addDays(this.sentDate, this.daysToPay);
            return ToolsDate_1.default.dateJsToSql(payDay);
        }
    };
    return Invoice;
}());
exports.default = Invoice;
