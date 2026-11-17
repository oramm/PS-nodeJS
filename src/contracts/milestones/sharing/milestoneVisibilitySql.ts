import mysql from 'mysql2/promise';

/** One effective contract must match every filter; EXISTS never multiplies entity rows. */
export function milestoneVisibilitySql(filters: {
    contractId?: number;
    statusPattern?: string;
    statuses?: string[];
    excludedStatuses?: string[];
    typeId?: number;
    adminId?: number;
}): string {
    const clauses: string[] = [];
    if (filters.contractId !== undefined)
        clauses.push(mysql.format('visibleContract.Id = ?', [filters.contractId]));
    if (filters.statusPattern !== undefined)
        clauses.push(mysql.format('visibleContract.Status REGEXP ?', [filters.statusPattern]));
    if (filters.statuses?.length)
        clauses.push(mysql.format('visibleContract.Status IN (?)', [filters.statuses]));
    if (filters.excludedStatuses?.length)
        clauses.push(mysql.format('visibleContract.Status NOT IN (?)', [filters.excludedStatuses]));
    if (filters.typeId !== undefined)
        clauses.push(mysql.format('visibleContract.TypeId = ?', [filters.typeId]));
    if (filters.adminId !== undefined)
        clauses.push(mysql.format(`EXISTS (
            SELECT 1 FROM OurContractsData AS visibleOurData
            WHERE (visibleOurData.Id = visibleContract.Id
                OR visibleOurData.OurId = visibleContract.OurIdRelated)
                AND visibleOurData.AdminId = ?
        )`, [filters.adminId]));
    if (!clauses.length) return '1';

    return `EXISTS (
        SELECT 1 FROM Contracts AS visibleContract
        WHERE visibleContract.ProjectOurId = (
            SELECT sourceContract.ProjectOurId FROM Contracts AS sourceContract
            WHERE sourceContract.Id = Milestones.ContractId
        )
        AND (visibleContract.Id = Milestones.ContractId OR (
            Milestones.OfferId IS NULL AND EXISTS (
                SELECT 1 FROM MilestoneContractLinks AS visibleLink
                WHERE visibleLink.MilestoneId = Milestones.Id
                    AND visibleLink.ContractId = visibleContract.Id
            )
        ))
        AND ${clauses.join(' AND ')}
    )`;
}
