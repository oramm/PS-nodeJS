import ToolsDb from '../tools/ToolsDb'
import ToolsDate from '../tools/ToolsDate'
import InvoiceItem from "./InvoiceItem";


export default class InvoiceItemsController {
  static async getInvoiceItemsList(initParamObject: any) {
    const invoiceCondition = (initParamObject && initParamObject.invoiceId) ? 'InvoiceItems.ParentId="' + initParamObject.invoiceId + '"' : '1';
    initParamObject.endDate = (!initParamObject.endDate) ? initParamObject.endDate = 'CURDATE()' : '"' + ToolsDate.dateDMYtoYMD(initParamObject.endDate) + '"';

    const dateCondition = (initParamObject && initParamObject.startDate) ? 'Invoices.IssueDate BETWEEN "' + ToolsDate.dateDMYtoYMD(initParamObject.startDate) + '" AND DATE_ADD(' + initParamObject.endDate + ', INTERVAL 1 DAY)' : '1';

    const sql = 'SELECT InvoiceItems.Id, \n \t' +
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

    const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
    return this.processInvoiceItemsResult(result);
  }

  static processInvoiceItemsResult(result: any[]): [InvoiceItem?] {
    let newResult: [InvoiceItem?] = [];

    for (const row of result) {
      var item = new InvoiceItem({
        id: row.Id,
        _parent: {
          id: row.ParentId,
        },
        description: ToolsDb.sqlToString(row.Description),
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
  }
}