"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var ToolsDb_1 = __importDefault(require("../tools/ToolsDb"));
var ToolsDate_1 = __importDefault(require("../tools/ToolsDate"));
var InvoiceItem_1 = __importDefault(require("./InvoiceItem"));
var InvoiceItemsController = /** @class */ (function () {
    function InvoiceItemsController() {
    }
    InvoiceItemsController.getInvoiceItemsList = function (initParamObject, cb) {
        var invoiceCondition = (initParamObject && initParamObject.invoiceId) ? 'InvoiceItems.ParentId="' + initParamObject.invoiceId + '"' : '1';
        initParamObject.endDate = (!initParamObject.endDate) ? initParamObject.endDate = 'CURDATE()' : '"' + ToolsDate_1.default.dateDMYtoYMD(initParamObject.endDate) + '"';
        var dateCondition = (initParamObject && initParamObject.startDate) ? 'Invoices.IssueDate BETWEEN "' + ToolsDate_1.default.dateDMYtoYMD(initParamObject.startDate) + '" AND DATE_ADD(' + initParamObject.endDate + ', INTERVAL 1 DAY)' : '1';
        var sql = 'SELECT InvoiceItems.Id, \n \t' +
            'InvoiceItems.ParentId, \n \t' +
            'InvoiceItems.Description, \n \t' +
            'InvoiceItems.Quantity, \n \t' +
            'InvoiceItems.UnitPrice, \n \t' +
            'InvoiceItems.VatTax, \n \t' +
            'InvoiceItems.LastUpdated, \n \t' +
            'Editors.Id AS EditorId, \n \t' +
            'Editors.Name AS EditorName, \n \t' +
            'Editors.Surname AS EditorSurname, \n \t' +
            'Editors.Email AS EditorEmail \n' +
            'FROM InvoiceItems \n' +
            'JOIN Invoices ON Invoices.Id=InvoiceItems.ParentId \n' +
            'JOIN Persons AS Editors ON Editors.Id=InvoiceItems.EditorId \n' +
            'WHERE ' + invoiceCondition + ' AND ' + dateCondition + '\n' +
            'ORDER BY InvoiceItems.Id DESC';
        ToolsDb_1.default.getQueryCallback(sql, cb);
    };
    InvoiceItemsController.processInvoiceItemsResult = function (result) {
        var newResult = [];
        for (var _i = 0, result_1 = result; _i < result_1.length; _i++) {
            var row = result_1[_i];
            var item = new InvoiceItem_1.default({
                id: row.Id,
                _parent: {
                    id: row.ParentId,
                },
                description: ToolsDb_1.default.sqlToString(row.Description),
                quantity: row.Quantity,
                unitPrice: row.UnitPrice,
                vatTax: row.VatTax,
                _lastUpdated: row.LastUpdated,
                //ostatni edytujący
                _editor: {
                    id: row.EditorId,
                    name: row.EditorName,
                    surname: row.EditorSurname,
                    email: row.EditorEmail
                },
            });
            newResult.push(item);
        }
        return newResult;
    };
    return InvoiceItemsController;
}());
exports.default = InvoiceItemsController;
