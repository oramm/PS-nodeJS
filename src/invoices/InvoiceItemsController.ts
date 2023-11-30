import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb'
import ToolsDate from '../tools/ToolsDate'
import InvoiceItem from "./InvoiceItem";

type InvoiceItemSearchParams = {
    invoiceId?: number,
    startDate?: string,
    endDate?: string,
    contractId?: number,
}

export default class InvoiceItemsController {
    static async getInvoiceItemsList(orConditions: InvoiceItemSearchParams[] = []) {

        const sql = `SELECT InvoiceItems.Id,
                            InvoiceItems.Description,
                            InvoiceItems.Quantity,
                            InvoiceItems.UnitPrice,
                            InvoiceItems.VatTax,
                            InvoiceItems.LastUpdated,
                            Invoices.Id as InvoiceId,
                            Invoices.Number as InvoiceNumber,
                            Invoices.Description as InvoiceDescription,
                            Invoices.Status as InvoiceStatus,
                            Invoices.CreationDate as InvoiceCreationDate,
                            Invoices.IssueDate as InvoiceIssueDate,
                            Invoices.SentDate as InvoiceSentDate,
                            Invoices.DaysToPay as InvoiceDaysToPay,
                            Invoices.PaymentDeadline as InvoicePaymentDeadline,
                            Invoices.GdId as InvoiceGdId,
                            Invoices.LastUpdated as InvoiceLastUpdated,
                            Contracts.Id as ContractId,
                            Contracts.Value as ContractValue,
                            Contracts.Number as ContractNumber,
                            Contracts.Name as ContractName,
                            Contracts.Alias as ContractAlias,
                            OurContractsData.OurId as ContractOurId,
                            ContractTypes.Id AS ContractTypeId,
                            ContractTypes.Name AS ContractTypeName,
                            ContractTypes.IsOur AS ContractTypeIsOur,
                            ContractTypes.Id AS ContractTypeDescription,                
                            Editors.Id AS EditorId,
                            Editors.Name AS EditorName,
                            Editors.Surname AS EditorSurname,
                            Editors.Email AS EditorEmail
                        FROM InvoiceItems
                        JOIN Invoices ON Invoices.Id=InvoiceItems.ParentId
                        JOIN Contracts ON Contracts.Id=Invoices.ContractId
                        JOIN OurContractsData ON OurContractsData.Id=Contracts.Id
                        JOIN ContractTypes ON ContractTypes.Id=Contracts.TypeId
                        LEFT JOIN Persons AS Editors ON Editors.Id=InvoiceItems.EditorId
                        WHERE ${ToolsDb.makeOrGroupsConditions(orConditions, this.makeAndConditions.bind(this))}
                        ORDER BY InvoiceItems.Id DESC`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processInvoiceItemsResult(result);
    }

    static makeAndConditions(searchParams: InvoiceItemSearchParams) {
        const invoiceCondition = searchParams.invoiceId
            ? mysql.format(`InvoiceItems.ParentId = ? `, [searchParams.invoiceId])
            : '1';

        searchParams.endDate = (!searchParams.endDate) ? searchParams.endDate = 'CURDATE()' : '"' + ToolsDate.dateDMYtoYMD(searchParams.endDate) + '"';

        const dateCondition = (searchParams.startDate) ? 'Invoices.IssueDate BETWEEN "' + ToolsDate.dateDMYtoYMD(searchParams.startDate) + '" AND DATE_ADD(' + searchParams.endDate + ', INTERVAL 1 DAY)' : '1';

        return `${invoiceCondition} 
        AND ${dateCondition} `;
    }

    static processInvoiceItemsResult(result: any[]) {
        let newResult: InvoiceItem[] = [];

        for (const row of result) {
            var item = new InvoiceItem({
                id: row.Id,
                _parent: {
                    id: row.InvoiceId,
                    number: row.InvoiceNumber,
                    description: row.InvoiceDescription,
                    status: row.InvoiceStatus,
                    creationDate: row.InvoiceCreationDate,
                    issueDate: row.InvoiceIssueDate,
                    sentDate: row.InvoiceSentDate,
                    daysToPay: row.InvoiceDaysToPay,
                    paymentDeadline: row.InvoicePaymentDeadline,
                    gdId: row.InvoiceGdId,
                    _lastUpdated: row.InvoiceLastUpdated,
                    _contract: {
                        id: row.ContractId,
                        value: parseFloat(row.ContractValue),
                        number: row.ContractNumber,
                        name: row.ContractName,
                        alias: row.ContractAlias,
                        ourId: row.ContractOurId,
                        _type: {
                            id: row.ContractTypeId,
                            name: row.ContractTypeName,
                            description: row.ContractTypeDescription,
                            isOur: row.ContractTypeIsOur
                        }
                    }
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