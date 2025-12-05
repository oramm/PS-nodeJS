import ToolsDb from '../../../../../tools/ToolsDb';

export type RisksReactionsSearchParams = {
    projectId?: string;
    contractId?: number;
};

export interface RiskReactionData {
    id: number;
    caseId: number;
    name: string;
    description: string;
    deadline: string;
    status: string;
    ownerId: number;
    lastUpdated: string;
    _parent: {
        id: number;
    };
    _nameSurnameEmail: string;
}

export default class RiskReactionRepository {
    protected tableName = 'Tasks'; // Reakcje na ryzyka są przechowywane w tabeli Tasks

    /**
     * Wyszukuje reakcje na ryzyka według parametrów
     * Repository Layer - zawiera TYLKO logikę SQL i mapowanie
     * @param searchParams - Parametry wyszukiwania
     * @returns Promise<RiskReactionData[]>
     */
    async find(
        searchParams: RisksReactionsSearchParams = {}
    ): Promise<RiskReactionData[]> {
        const projectCondition = searchParams.projectId
            ? `RisksReactions.ProjectOurId="${searchParams.projectId}"`
            : '1';
        const contractCondition = searchParams.contractId
            ? `Contracts.Id="${searchParams.contractId}"`
            : '1';

        const sql =
            'SELECT  Tasks.Id, \n \t' +
            'Tasks.CaseId, \n \t' +
            'Tasks.Name, \n \t' +
            'Tasks.Description, \n \t ' +
            'Tasks.Deadline, \n \t' +
            'Tasks.Status, \n \t' +
            'Tasks.OwnerId, \n \t' +
            'Tasks.LastUpdated, \n \t' +
            'Contracts.Id AS ContractId, \n \t' +
            'Contracts.Number AS ContractNumber, \n \t' +
            'Contracts.Name AS ContractName, \n \t' +
            'Persons.Name AS OwnerName, \n \t' +
            'Persons.Surname AS OwnerSurname, \n \t' +
            'Persons.Email AS OwnerEmail \n' +
            'FROM Tasks \n' +
            'JOIN Cases ON Cases.Id=Tasks.CaseId \n' +
            'JOIN Milestones ON Milestones.Id=Cases.MilestoneId \n' +
            'JOIN Contracts ON Milestones.ContractId = Contracts.Id \n' +
            'JOIN OurContractsData ON Milestones.ContractId = OurContractsData.Id \n' +
            'LEFT JOIN Persons ON Persons.Id = Tasks.OwnerId \n' +
            'WHERE ' +
            projectCondition +
            ' ANY ' +
            contractCondition;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return result.map((row) => this.mapRowToModel(row));
    }

    protected mapRowToModel(row: any): RiskReactionData {
        const name = row.OwnerName ? row.OwnerName : '';
        const surname = row.OwnerSurname ? row.OwnerSurname : '';
        const email = row.OwnerEmail ? row.OwnerEmail : '';

        return {
            id: row.Id,
            caseId: row.CaseId,
            name: row.Name,
            description: row.Description,
            deadline: row.Deadline,
            status: row.Status,
            ownerId: row.OwnerId,
            lastUpdated: row.LastUpdated,
            _parent: {
                id: row.CaseId,
            },
            _nameSurnameEmail: name
                ? name.trim() + ' ' + surname.trim() + ': ' + email.trim()
                : '',
        };
    }
}
