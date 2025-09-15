import BaseRepository from '../repositories/BaseRepository';
import InvoiceItem from './InvoiceItem';
import ToolsDb from '../tools/ToolsDb';
import mysql from 'mysql2/promise';

export interface InvoiceItemsSearchParams {
    invoiceItemId?: number;
    invoiceId?: number;
    startDate?: string;
    endDate?: string;
    contractId?: number;
}

export default class InvoiceItemRepository extends BaseRepository<InvoiceItem> {
    constructor() {
        super('InvoiceItems');
    }

    protected mapRowToModel(row: any): InvoiceItem {
        return new InvoiceItem({
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
                        isOur: row.ContractTypeIsOur,
                    },
                },
            },
            description: ToolsDb.sqlToString(row.Description),
            quantity: row.Quantity,
            unitPrice: row.UnitPrice,
            vatTax: row.VatTax,
            _lastUpdated: row.LastUpdated,
            _editor: {
                id: row.EditorId,
                name: row.EditorName,
                surname: row.EditorSurname,
                email: row.EditorEmail,
            },
        });
    }

    async find(orConditions: InvoiceItemsSearchParams[] = []) {
        const conditions =
            orConditions.length > 0
                ? this.makeOrGroupsConditions(
                      orConditions,
                      this.makeAndConditions.bind(this)
                  )
                : '1';

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
                        WHERE ${conditions}
                        ORDER BY InvoiceItems.Id DESC`;

        const rows = await this.executeQuery(sql);
        return rows.map((row) => this.mapRowToModel(row));
    }

    private makeAndConditions(searchParams: InvoiceItemsSearchParams) {
        const conditions: string[] = [];

        const invoiceItemCondition = searchParams.invoiceItemId
            ? mysql.format(`InvoiceItems.Id = ?`, [searchParams.invoiceItemId])
            : '1';
        conditions.push(invoiceItemCondition);

        const invoiceCondition = searchParams.invoiceId
            ? mysql.format(`InvoiceItems.ParentId = ?`, [
                  searchParams.invoiceId,
              ])
            : '1';
        conditions.push(invoiceCondition);

        if (searchParams.startDate) {
            conditions.push(
                mysql.format(`Invoices.IssueDate >= ?`, [
                    searchParams.startDate,
                ])
            );
        }

        if (searchParams.endDate) {
            conditions.push(
                mysql.format(`Invoices.IssueDate <= ?`, [searchParams.endDate])
            );
        }

        // Combine all conditions using "AND" to form the final query clause.
        return conditions.join(' AND ');
    }
}
