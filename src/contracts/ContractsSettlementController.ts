import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb'
import ContractType from "./contractTypes/ContractType";
import Project from '../projects/Project';
import Setup from '../setup/Setup';

export type ContractSettlementSearchParams = {
    id?: number,
    projectId?: string,
    _parent?: Project,
    contractOurId?: string,
    startDateFrom?: string,
    startDateTo?: string,
    endDateFrom?: string,
    endDateTo?: string,
    typeId?: number,
    invoiceStatuses?: string[],
    _contractType?: ContractType,
    typesToInclude?: 'our' | 'other' | 'all',
    isArchived?: boolean
}

export default class ContractsSettlementController {
    static async getSums(searchParams: ContractSettlementSearchParams = {}) {
        const projectOurId = searchParams._parent?.ourId || searchParams.projectId;
        const typeId = searchParams._contractType?.id || searchParams.typeId;
        const isArchived = typeof searchParams.isArchived === 'string'

        const idCondition = searchParams.id
            ? mysql.format(`mainContracts.Id = ?`, [searchParams.id])
            : '1';


        const statusList = searchParams.invoiceStatuses || [
            Setup.InvoiceStatus.DONE,
            Setup.InvoiceStatus.SENT,
            Setup.InvoiceStatus.PAID
        ];
        console.log(statusList);

        const statusCondition = statusList.length > 0
            ? mysql.format(`Invoices.Status IN (?)`, [statusList])
            : '1';  // domyślna wartość, jeśli statusList jest pusty

        const projectCondition = projectOurId
            ? mysql.format(`mainContracts.ProjectOurId = ?`, [projectOurId])
            : '1';
        const contractOurIdCondition = searchParams.contractOurId
            ? mysql.format(`OurContractsData.OurId LIKE ?`, [`%${searchParams.contractOurId}%`])
            : '1';
        const startDateFromCondition = searchParams.startDateFrom
            ? mysql.format(`mainContracts.StartDate >= ?`, [searchParams.startDateFrom])
            : '1';
        const startDateToCondition = searchParams.startDateTo
            ? mysql.format(`mainContracts.StartDate <= ?`, [searchParams.startDateTo])
            : '1';

        const endDateFromCondition = searchParams.endDateFrom
            ? mysql.format(`mainContracts.EndDate >= ?`, [searchParams.endDateFrom])
            : '1';
        const endDateToCondition = searchParams.endDateTo
            ? mysql.format(`mainContracts.EndDate <= ?`, [searchParams.endDateTo])
            : '1';
        const typeCondition = typeId
            ? mysql.format(`mainContracts.TypeId = ?`, [typeId])
            : '1';

        let typesToIncudeCondition;
        switch (searchParams.typesToInclude) {
            case 'our':
                typesToIncudeCondition = 'OurContractsData.OurId IS NOT NULL';
                break;
            case 'other':
                typesToIncudeCondition = 'OurContractsData.OurId IS NULL';
                break;
            default:
                typesToIncudeCondition = '1';
        }
        const isArchivedConditon = (isArchived) ? `mainContracts.Status=${Setup.ContractStatus.ARCHIVAL}` : 1;//'mainContracts.Status!="Archiwalny"';

        const sql = `SELECT 
            mainContracts.Id, 
            mainContracts.Value, 
            OurContractsData.OurId, 
            SUM(InvoiceItems.Quantity * InvoiceItems.UnitPrice) AS TotalIssuedValue,
            (SELECT mainContracts.Value - IFNULL(SUM(InvoiceItems.Quantity * InvoiceItems.UnitPrice), 0)) AS RemainingValue
          FROM Contracts AS mainContracts
          LEFT JOIN OurContractsData ON OurContractsData.Id=mainContracts.id
          LEFT JOIN Invoices ON Invoices.ContractId=mainContracts.Id
          LEFT JOIN InvoiceItems ON InvoiceItems.ParentId=Invoices.Id 
          WHERE ${idCondition} 
            AND ${statusCondition}
            AND ${projectCondition} 
            AND ${contractOurIdCondition} 
            AND ${isArchivedConditon}
            AND ${startDateFromCondition}
            AND ${startDateToCondition}
            AND ${endDateFromCondition}
            AND ${endDateToCondition}
            AND ${typeCondition}
            AND ${typesToIncudeCondition}
          ORDER BY mainContracts.ProjectOurId, OurContractsData.OurId DESC, mainContracts.Number`;

        try {
            const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
            return this.processContractsResult(result, searchParams);
        } catch (err) {
            console.log(sql);
            throw (err);
        }
    }

    private static processContractsResult(result: any[], initParamObject: any) {
        const newResult: ContractSettlementData[] = [];
        for (const row of result) {
            const item: ContractSettlementData = {
                id: row.Id,
                ourId: row.OurId,
                value: row.Value,
                totalIssuedValue: row.TotalIssuedValue,
                remainingValue: row.RemainingValue
            };
            newResult.push(item);
        }
        return newResult;
    }
}

type ContractSettlementData = {
    id: number,
    ourId: string,
    value: number,
    totalIssuedValue: number,
    remainingValue: number
}