import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb'
import ToolsDate from '../tools/ToolsDate'
import InvoiceItem from "./InvoiceItem";


export default class InvoiceItemsController {
    static async getInvoiceItemsList(searchParams: {
        invoiceId?: number,
        startDate?: string,
        endDate?: string,
        contractId?: number,
    } = {}) {
        const invoiceCondition = searchParams.invoiceId
            ? mysql.format(`InvoiceItems.ParentId = ?`, [searchParams.invoiceId])
            : '1';

        searchParams.endDate = (!searchParams.endDate) ? searchParams.endDate = 'CURDATE()' : '"' + ToolsDate.dateDMYtoYMD(searchParams.endDate) + '"';

        const dateCondition = (searchParams.startDate) ? 'Invoices.IssueDate BETWEEN "' + ToolsDate.dateDMYtoYMD(searchParams.startDate) + '" AND DATE_ADD(' + searchParams.endDate + ', INTERVAL 1 DAY)' : '1';

        const sql = `SELECT InvoiceItems.Id,
                            InvoiceItems.ParentId,
                            InvoiceItems.Description,
                            InvoiceItems.Quantity,
                            InvoiceItems.UnitPrice,
                            InvoiceItems.VatTax,
                            InvoiceItems.LastUpdated,
                            Editors.Id AS EditorId,
                            Editors.Name AS EditorName,
                            Editors.Surname AS EditorSurname,
                            Editors.Email AS EditorEmail
                        FROM InvoiceItems
                        JOIN Invoices ON Invoices.Id=InvoiceItems.ParentId
                        LEFT JOIN Persons AS Editors ON Editors.Id=InvoiceItems.EditorId
                        WHERE ${invoiceCondition} 
                          AND ${dateCondition}
                        ORDER BY InvoiceItems.Id DESC`;


        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processInvoiceItemsResult(result);
    }

    static processInvoiceItemsResult(result: any[]) {
        let newResult: InvoiceItem[] = [];

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