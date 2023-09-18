import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb'
import Invoice from "./Invoice";
import Project from '../projects/Project';
import Contract from '../contracts/Contract';
import ContractOur from '../contracts/ContractOur';
import ContractOther from '../contracts/ContractOther';


export default class InvoicesController {
    static async getInvoicesList(searchParams: {
        id?: number,
        projectId?: string,
        _project?: Project,
        contractId?: number,
        _contract?: Contract,
        searchText?: string,
        issueDateFrom?: string,
        issueDateTo?: string,
        status?: string
    } = {}) {
        const projectOurId = searchParams._project?.ourId || searchParams.projectId;
        const contractId = searchParams._contract?.id || searchParams.contractId;

        const idCondition = searchParams.id
            ? mysql.format(`Invoices.Id = ?`, [searchParams.id])
            : '1';

        const projectCondition = projectOurId
            ? mysql.format(`Contracts.ProjectOurId = ?`, [projectOurId])
            : '1';
        const contractCondition = contractId
            ? mysql.format(`Invoices.ContractId = ?`, [contractId])
            : '1';
        const issueDateFromCondition = searchParams.issueDateFrom
            ? mysql.format(`Invoices.IssueDate >= ?`, [searchParams.issueDateFrom])
            : '1';
        const issueDateToCondition = searchParams.issueDateTo
            ? mysql.format(`Invoices.IssueDate <= ?`, [searchParams.issueDateTo])
            : '1';
        const statusCondition = searchParams.status
            ? mysql.format(`Invoices.Status = ?`, [searchParams.status])
            : '1';
        const searchTextCondition = this.makeSearchTextCondition(searchParams.searchText);

        const sql = `SELECT Invoices.Id,
            Invoices.Number,
            Invoices.Description,
            Invoices.Status,
            Invoices.CreationDate,
            Invoices.IssueDate,
            Invoices.SentDate,
            Invoices.DaysToPay,
            Invoices.PaymentDeadline,
            Invoices.GdId,
            Invoices.LastUpdated,
            Invoices.ContractId,
            Entities.Id AS EntityId,
            Entities.Name AS EntityName,
            Entities.Address AS EntityAddress,
            Entities.TaxNumber AS EntityTaxNumber,
            Contracts.Number AS ContractNumber,
            Contracts.Name AS ContractName,
            Contracts.Alias AS ContractAlias,
            Contracts.GdFolderId AS ContractGdFolderId,
            OurContractsData.OurId AS ContractOurId,
            ContractTypes.Id AS ContractTypeId,
            ContractTypes.Name AS ContractTypeName,
            ContractTypes.IsOur AS ContractTypeIsOur,
            ContractTypes.Id AS ContractTypeDescription,
            Projects.OurId AS ProjectOurId,
            Projects.Name AS ProjectName,
            Projects.GdFolderId AS ProjectGdFolderId,
            Editors.Id AS EditorId,
            Editors.Name AS EditorName,
            Editors.Surname AS EditorSurname,
            Editors.Email AS EditorEmail,
            Owners.Id AS OwnerId,
            Owners.Name AS OwnerName,
            Owners.Surname AS OwnerSurname,
            Owners.Email AS OwnerEmail,
            ROUND(SUM(InvoiceItems.Quantity * InvoiceItems.UnitPrice), 2) as TotalNetValue
        FROM Invoices
        JOIN Entities ON Entities.Id=Invoices.EntityId
        JOIN Contracts ON Contracts.Id=Invoices.ContractId
        JOIN ContractTypes ON ContractTypes.Id = Contracts.TypeId
        JOIN OurContractsData ON OurContractsData.Id = Contracts.Id
        JOIN Projects ON Projects.OurId=Contracts.ProjectOurId
        LEFT JOIN Persons AS Editors ON Editors.Id=Invoices.EditorId
        LEFT JOIN Persons AS Owners ON Owners.Id=Invoices.OwnerId
        LEFT JOIN InvoiceItems ON InvoiceItems.ParentId = Invoices.Id
        WHERE ${idCondition}
            AND ${projectCondition} 
            AND ${contractCondition} 
            AND ${issueDateFromCondition}
            AND ${issueDateToCondition}
            AND ${statusCondition}
            AND ${searchTextCondition}
        GROUP BY Invoices.Id
        ORDER BY Invoices.IssueDate ASC`;


        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processInvoicesResult(result);
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1'
        searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map(word =>
            mysql.format(`(Invoices.Number LIKE ? 
                          OR Invoices.Description LIKE ? 
                          OR Invoices.Status LIKE ? 
                          OR Entities.Name LIKE ?
                          OR OurContractsData.OurId LIKE ?
                          OR Contracts.Number LIKE ?
                          OR Contracts.Name LIKE ?
                          OR Contracts.Alias LIKE ?
                          OR EXISTS (
                              SELECT 1 
                              FROM InvoiceItems
                              WHERE InvoiceItems.ParentId = Invoices.Id 
                                  AND InvoiceItems.Description LIKE ?
                          ))`,
                [`%${word}%`, `%${word}%`, `%${word}%`, `%${word}%`, `%${word}%`, `%${word}%`, `%${word}%`, `%${word}%`, `%${word}%`]));

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }


    static processInvoicesResult(result: any[]): [Invoice?] {
        let newResult: [Invoice?] = [];

        for (const row of result) {
            const contractInitParams = {
                id: row.ContractId,
                ourId: row.ContractOurId,
                number: row.ContractNumber,
                alias: row.ContractAlias,
                name: ToolsDb.sqlToString(row.ContractName),
                _totalNetValue: row.TotalValue,
                gdFolderId: row.ContractGdFolderId,
                _parent: {
                    ourId: row.ProjectOurId,
                    name: row.ProjectName,
                    gdFolderId: row.ProjectGdFolderId
                },
                _type: {
                    id: row.ContractTypeId,
                    name: row.ContractTypeName,
                    description: row.ContractTypeDescription,
                    isOur: row.ContractTypeIsOur
                }
            }
            const _contract = contractInitParams.ourId ? new ContractOur(contractInitParams) : new ContractOther(contractInitParams);

            const item = new Invoice({
                id: row.Id,
                number: row.Number,
                description: ToolsDb.sqlToString(row.Description),
                status: row.Status,
                issueDate: row.IssueDate,
                sentDate: row.SentDate,
                daysToPay: row.DaysToPay,
                paymentDeadline: row.PaymentDeadline,
                gdId: row.GdId,
                _lastUpdated: row.LastUpdated,
                _entity: {
                    id: row.EntityId,
                    name: ToolsDb.sqlToString(row.EntityName),
                    address: row.EntityAddress,
                    taxNumber: row.EntityTaxNumber
                },
                _contract: _contract,
                //ostatni edytujący
                _editor: {
                    id: row.EditorId,
                    name: row.EditorName,
                    surname: row.EditorSurname,
                    email: row.EditorEmail
                },
                //odpowiedzialny za kolejną akcję
                _owner: {
                    id: row.OwnerId,
                    name: row.OwnerName,
                    surname: row.OwnerSurname,
                    email: row.OwnerEmail
                },
                _totalNetValue: row.TotalNetValue
            });
            newResult.push(item);
        }
        return newResult;
    }
}