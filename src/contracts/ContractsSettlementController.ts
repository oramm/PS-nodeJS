import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import ContractType from './contractTypes/ContractType';
import Project from '../projects/Project';
import Setup from '../setup/Setup';

export type ContractSettlementSearchParams = {
    id?: number;
    projectId?: string;
    _project?: Project;
    contractOurId?: string;
    startDateFrom?: string;
    startDateTo?: string;
    endDateFrom?: string;
    endDateTo?: string;
    typeId?: number;
    invoiceStatuses?: string[];
    _contractType?: ContractType;
    typesToInclude?: 'our' | 'other' | 'all';
    isArchived?: boolean;
};

export default class ContractsSettlementController {
    static async getSums(orConditions: ContractSettlementSearchParams[] = []) {
        orConditions.forEach((condition) => {
            condition.invoiceStatuses =
                condition.invoiceStatuses || this.externalStatuses();
        });
        const externalStatuses = this.externalStatuses()
            .map((s) => `'${s}'`)
            .join(', ');
        const registeredStatuses = this.registeredStatuses()
            .map((s) => `'${s}'`)
            .join(', ');

        const sql = `SELECT 
            Contracts.Id, 
            Contracts.Value, 
            OurContractsData.OurId, 
            SUM(CASE WHEN Invoices.Status IN (${externalStatuses}) THEN InvoiceItems.Quantity * InvoiceItems.UnitPrice ELSE 0 END) AS TotalIssuedValue,
            SUM(CASE WHEN Invoices.Status IN (${registeredStatuses}) THEN InvoiceItems.Quantity * InvoiceItems.UnitPrice ELSE 0 END) AS TotalRegisteredValue,
            Contracts.Value - IFNULL(SUM(CASE WHEN Invoices.Status IN (${externalStatuses}) THEN InvoiceItems.Quantity * InvoiceItems.UnitPrice ELSE 0 END), 0) AS RemainingIssuedValue,
            Contracts.Value - IFNULL(SUM(CASE WHEN Invoices.Status IN (${registeredStatuses}) THEN InvoiceItems.Quantity * InvoiceItems.UnitPrice ELSE 0 END), 0) AS RemainingRegisteredValue
          FROM Contracts
          LEFT JOIN OurContractsData ON OurContractsData.Id=Contracts.id
          LEFT JOIN Invoices ON Invoices.ContractId=Contracts.Id
          LEFT JOIN InvoiceItems ON InvoiceItems.ParentId=Invoices.Id 
          WHERE ${ToolsDb.makeOrGroupsConditions(
              orConditions,
              this.makeAndConditions.bind(this)
          )}
          ORDER BY Contracts.ProjectOurId, OurContractsData.OurId DESC, Contracts.Number`;

        try {
            const result: any[] = <any[]>(
                await ToolsDb.getQueryCallbackAsync(sql)
            );
            return this.processContractsResult(result, orConditions[0]);
        } catch (err) {
            console.log(sql);
            throw err;
        }
    }

    static makeAndConditions(searchParams: ContractSettlementSearchParams) {
        const projectOurId =
            searchParams._project?.ourId || searchParams.projectId;
        const typeId = searchParams._contractType?.id || searchParams.typeId;
        const isArchived = typeof searchParams.isArchived === 'string';

        const idCondition = searchParams.id
            ? mysql.format(`Contracts.Id = ?`, [searchParams.id])
            : '1';

        const projectCondition = projectOurId
            ? mysql.format(`Contracts.ProjectOurId = ?`, [projectOurId])
            : '1';
        const contractOurIdCondition = searchParams.contractOurId
            ? mysql.format(`OurContractsData.OurId LIKE ?`, [
                  `%${searchParams.contractOurId}%`,
              ])
            : '1';
        const startDateFromCondition = searchParams.startDateFrom
            ? mysql.format(`Contracts.StartDate >= ?`, [
                  searchParams.startDateFrom,
              ])
            : '1';
        const startDateToCondition = searchParams.startDateTo
            ? mysql.format(`Contracts.StartDate <= ?`, [
                  searchParams.startDateTo,
              ])
            : '1';

        const endDateFromCondition = searchParams.endDateFrom
            ? mysql.format(`Contracts.EndDate >= ?`, [searchParams.endDateFrom])
            : '1';
        const endDateToCondition = searchParams.endDateTo
            ? mysql.format(`Contracts.EndDate <= ?`, [searchParams.endDateTo])
            : '1';
        const typeCondition = typeId
            ? mysql.format(`Contracts.TypeId = ?`, [typeId])
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
        const isArchivedConditon = isArchived
            ? `Contracts.Status=${Setup.ContractStatus.ARCHIVAL}`
            : 1; //'Contracts.Status!="Archiwalny"';

        return `${idCondition} 
            AND ${projectCondition} 
            AND ${contractOurIdCondition} 
            AND ${isArchivedConditon}
            AND ${startDateFromCondition}
            AND ${startDateToCondition}
            AND ${endDateFromCondition}
            AND ${endDateToCondition}
            AND ${typeCondition}
            AND ${typesToIncudeCondition}`;
    }

    private static processContractsResult(
        result: any[],
        initParamObject: ContractSettlementSearchParams
    ) {
        const newResult: ContractSettlementData[] = [];
        for (const row of result) {
            const item: ContractSettlementData = {
                id: row.Id,
                ourId: row.OurId,
                value: parseFloat(row.Value),
                totalIssuedValue: parseFloat(row.TotalIssuedValue),
                totalRegisteredValue: parseFloat(row.TotalRegisteredValue),
                remainingIssuedValue: parseFloat(row.RemainingIssuedValue),
                remainingRegisteredValue: parseFloat(
                    row.RemainingRegisteredValue
                ),
            };
            newResult.push(item);
        }
        return newResult;
    }

    /**statusy wydane na zewnątrz */
    private static externalStatuses() {
        return [
            Setup.InvoiceStatus.TO_DO,
            Setup.InvoiceStatus.DONE,
            Setup.InvoiceStatus.SENT,
            Setup.InvoiceStatus.PAID,
        ];
    }

    /**statusy  zarejestrowane poza  */
    private static registeredStatuses() {
        return [
            Setup.InvoiceStatus.FOR_LATER,
            Setup.InvoiceStatus.TO_CORRECT,
            Setup.InvoiceStatus.TO_DO,
            Setup.InvoiceStatus.DONE,
            Setup.InvoiceStatus.SENT,
            Setup.InvoiceStatus.PAID,
        ];
    }
}

export type ContractSettlementData = {
    id: number;
    ourId: string;
    value: number;
    totalIssuedValue: number;
    totalRegisteredValue: number;
    remainingRegisteredValue: number;
    remainingIssuedValue: number;
};
