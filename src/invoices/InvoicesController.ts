import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb'
import ToolsDate from '../tools/ToolsDate'
import Invoice from "./Invoice";


export default class InvoicesController {
    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1'

        const words = searchText.split(' ');
        const conditions = words.map(word =>
            mysql.format(`(Invoices.Number LIKE ? 
                          OR Invoices.Description LIKE ? 
                          OR Invoices.Status LIKE ? 
                          OR Entities.Name LIKE ?)`,
                [`%${word}%`, `%${word}%`, `%${word}%`, `%${word}%`]));

        const searchTextCondition = conditions.join(' AND ');


        return searchTextCondition;
    }

    static async getInvoicesList(searchParams: {
        projectId?: string,
        contractId?: number,
        searchText?: string,
        issueDateFrom?: string,
        issueDateTo?: string,
    } = {}) {
        const projectCondition = searchParams.projectId
            ? mysql.format(`Contracts.ProjectOurId = ?`, [searchParams.projectId])
            : '1';

        const contractCondition = searchParams.contractId
            ? mysql.format(`Milestones.ContractId = ?`, [searchParams.contractId])
            : '1';
        const issueDateFromCondition = searchParams.issueDateFrom
            ? mysql.format(`Invoices.IssueDate >= ?`, [searchParams.issueDateFrom])
            : '1';
        const issueDateToCondition = searchParams.issueDateTo
            ? mysql.format(`Invoices.IssueDate <= ?`, [searchParams.issueDateTo])
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
            Owners.Email AS OwnerEmail
        FROM Invoices
        JOIN Entities ON Entities.Id=Invoices.EntityId
        JOIN Contracts ON Contracts.Id=Invoices.ContractId
        JOIN ContractTypes ON ContractTypes.Id = Contracts.TypeId
        JOIN OurContractsData ON OurContractsData.Id = Contracts.Id
        JOIN Projects ON Projects.OurId=Contracts.ProjectOurId
        LEFT JOIN Persons AS Editors ON Editors.Id=Invoices.EditorId
        LEFT JOIN Persons AS Owners ON Owners.Id=Invoices.OwnerId
        WHERE ${projectCondition} 
          AND ${contractCondition} 
          AND ${issueDateFromCondition}
          AND ${issueDateToCondition}
          AND ${searchTextCondition}
        ORDER BY Invoices.IssueDate ASC`;


        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processInvoicesResult(result);
    }

    static processInvoicesResult(result: any[]): [Invoice?] {
        let newResult: [Invoice?] = [];

        for (const row of result) {
            const item = new Invoice({
                id: row.Id,
                number: row.Number,
                description: ToolsDb.sqlToString(row.Description),
                status: row.Status,
                creationDate: row.CreationDate,
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
                _contract: {
                    id: row.ContractId,
                    number: row.ContractNumber,
                    name: ToolsDb.sqlToString(row.ContractName),
                    gdFolderId: row.ContractGdFolderId,
                    ourId: row.ContractOurId,
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
                },
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
                }
            });
            newResult.push(item);
        }
        return newResult;
    }
}