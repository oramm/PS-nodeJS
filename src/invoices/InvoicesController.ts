
import ToolsDb from '../tools/ToolsDb'
import ToolsDate from '../tools/ToolsDate'
import Invoice from "./Invoice";


export default class InvoicesController {
    static async getInvoicesList(initParamObject: any) {
        const projectCondition = (initParamObject && initParamObject.projectId) ? 'Contracts.ProjectOurId="' + initParamObject.projectId + '"' : '1';
        const contractCondition = (initParamObject && initParamObject.contractId) ? 'Milestones.ContractId=' + initParamObject.contractId : '1';
        initParamObject.endDate = (!initParamObject.endDate) ? initParamObject.endDate = 'CURDATE()' : '"' + ToolsDate.dateDMYtoYMD(initParamObject.endDate) + '"';

        const dateCondition = (initParamObject && initParamObject.startDate) ? 'Invoices.IssueDate BETWEEN "' + ToolsDate.dateDMYtoYMD(initParamObject.startDate) + '" AND DATE_ADD(' + initParamObject.endDate + ', INTERVAL 1 DAY)' : '1';
        const sql = 'SELECT Invoices.Id, \n \t' +
            'Invoices.Number, \n \t' +
            'Invoices.Description, \n \t' +
            'Invoices.Status, \n \t' +
            'Invoices.CreationDate, \n \t' +
            'Invoices.IssueDate, \n \t' +
            'Invoices.SentDate, \n \t' +
            'Invoices.DaysToPay, \n \t' +
            'Invoices.PaymentDeadline, \n \t' +
            'Invoices.GdId, \n \t' +
            'Invoices.LastUpdated, \n \t' +
            'Invoices.ContractId, \n \t' +
            'Entities.Id AS EntityId, \n \t' +
            'Entities.Name AS EntityName, \n \t' +
            'Entities.Address AS EntityAddress, \n \t' +
            'Entities.TaxNumber AS EntityTaxNumber, \n \t' +
            'Contracts.Number AS ContractNumber, \n \t' +
            'Contracts.Name AS ContractName, \n \t' +
            'Contracts.GdFolderId AS ContractGdFolderId, \n \t' +
            'OurContractsData.OurId AS ContractOurId, \n \t' +
            'ContractTypes.Id AS ContractTypeId, \n \t' +
            'ContractTypes.Name AS ContractTypeName, \n \t' +
            'ContractTypes.IsOur AS ContractTypeIsOur, \n \t' +
            'ContractTypes.Id AS ContractTypeDescription, \n \t' +
            'Projects.OurId AS ProjectOurId, \n \t' +
            'Projects.Name AS ProjectName, \n \t' +
            'Projects.GdFolderId AS ProjectGdFolderId, \n \t' +
            'Editors.Id AS EditorId, \n \t' +
            'Editors.Name AS EditorName, \n \t' +
            'Editors.Surname AS EditorSurname, \n \t' +
            'Editors.Email AS EditorEmail, \n \t' +
            'Owners.Id AS OwnerId, \n \t' +
            'Owners.Name AS OwnerName, \n \t' +
            'Owners.Surname AS OwnerSurname, \n \t' +
            'Owners.Email AS OwnerEmail \n' +
            'FROM Invoices \n' +
            'JOIN Entities ON Entities.Id=Invoices.EntityId \n' +
            'JOIN Contracts ON Contracts.Id=Invoices.ContractId \n' +
            'JOIN ContractTypes ON ContractTypes.Id = Contracts.TypeId \n' +
            'JOIN OurContractsData ON OurContractsData.ContractId = Contracts.Id \n' +
            'JOIN Projects ON Projects.OurId=Contracts.ProjectOurId \n' +
            'LEFT JOIN Persons AS Editors ON Editors.Id=Invoices.EditorId \n' +
            'LEFT JOIN Persons AS Owners ON Owners.Id=Invoices.OwnerId \n' +
            'WHERE ' + projectCondition + ' AND ' + contractCondition + ' AND ' + dateCondition + '\n' +
            'ORDER BY Invoices.IssueDate ASC';

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processInvoicesResult(result);
    }

    static processInvoicesResult(result: any[]): [Invoice?] {
        let newResult: [Invoice?] = [];

        for (const row of result) {
            var item = new Invoice({
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