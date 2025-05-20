import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import Invoice from './Invoice';
import Project from '../projects/Project';
import Contract from '../contracts/Contract';
import ContractOur from '../contracts/ContractOur';
import Person from '../persons/Person';

type InvoiceSearchParams = {
    id?: number;
    projectId?: string;
    _project?: Project;
    contractId?: number;
    _contract?: Contract;
    searchText?: string;
    issueDateFrom?: string;
    issueDateTo?: string;
    statuses?: string[];
};

export default class InvoicesController {
    static async getInvoicesList(orConditions: InvoiceSearchParams[] = []) {
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
            Contracts.Value AS ContractValue,
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
            Cities.Id AS CityId,
            Cities.Name AS CityName,
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
        LEFT JOIN Cities ON Cities.Id = OurContractsData.CityId
        WHERE ${ToolsDb.makeOrGroupsConditions(
            orConditions,
            this.makeAndConditions.bind(this)
        )}
        GROUP BY Invoices.Id
        ORDER BY Invoices.IssueDate ASC`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processInvoicesResult(result);
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';
        searchText = searchText.toString();
        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(Invoices.Number LIKE ? 
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
                [
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                    `%${word}%`,
                ]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static makeAndConditions(searchParams: InvoiceSearchParams) {
        const conditions = [];

        if (searchParams.id) {
            conditions.push(mysql.format(`Invoices.Id = ?`, [searchParams.id]));
        }
        const projectOurId =
            searchParams._project?.ourId || searchParams.projectId;
        if (projectOurId) {
            conditions.push(
                mysql.format(`Contracts.ProjectOurId = ?`, [projectOurId])
            );
        }
        const contractId =
            searchParams._contract?.id || searchParams.contractId;
        if (contractId) {
            conditions.push(
                mysql.format(`Invoices.ContractId = ?`, [contractId])
            );
        }
        if (searchParams.issueDateFrom) {
            conditions.push(
                mysql.format(`Invoices.IssueDate >= ?`, [
                    searchParams.issueDateFrom,
                ])
            );
        }
        if (searchParams.issueDateTo) {
            conditions.push(
                mysql.format(`Invoices.IssueDate <= ?`, [
                    searchParams.issueDateTo,
                ])
            );
        }
        if (searchParams.statuses?.length) {
            const statusPlaceholders = searchParams.statuses
                .map(() => '?')
                .join(',');
            conditions.push(
                mysql.format(
                    `Invoices.Status IN (${statusPlaceholders})`,
                    searchParams.statuses
                )
            );
        }
        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );
        if (searchTextCondition !== '1') {
            conditions.push(searchTextCondition);
        }

        return conditions.length > 0 ? conditions.join(' AND ') : '1';
    }

    static processInvoicesResult(result: any[]): Invoice[] {
        let newResult: Invoice[] = [];

        for (const row of result) {
            const contractInitParams = {
                id: row.ContractId,
                ourId: row.ContractOurId,
                number: row.ContractNumber,
                alias: row.ContractAlias,
                value: row.ContractValue,
                name: ToolsDb.sqlToString(row.ContractName),
                _totalNetValue: row.TotalValue,
                gdFolderId: row.ContractGdFolderId,
                _parent: {
                    ourId: row.ProjectOurId,
                    name: row.ProjectName,
                    gdFolderId: row.ProjectGdFolderId,
                },
                _type: {
                    id: row.ContractTypeId,
                    name: row.ContractTypeName,
                    description: row.ContractTypeDescription,
                    isOur: row.ContractTypeIsOur,
                },
                _city: {
                    id: row.CityId,
                    name: row.CityName,
                },
            };
            const _contract = new ContractOur(contractInitParams);

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
                    taxNumber: row.EntityTaxNumber,
                },
                _contract: _contract,
                _editor: {
                    id: row.EditorId,
                    name: row.EditorName,
                    surname: row.EditorSurname,
                    email: row.EditorEmail,
                },
                _owner: new Person({
                    id: row.OwnerId,
                    name: row.OwnerName,
                    surname: row.OwnerSurname,
                    email: row.OwnerEmail,
                }),
                _totalNetValue: row.TotalNetValue,
            });
            newResult.push(item);
        }
        return newResult;
    }
}
