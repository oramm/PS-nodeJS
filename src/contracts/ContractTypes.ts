import ContractOther from './ContractOther';
import ContractOur from './ContractOur';
import Milestone from './milestones/Milestone';
import Case from './milestones/cases/Case';
import Task from './milestones/cases/tasks/Task';

export interface CaseWithTasks {
    caseItem: Case;
    /** Read-only occurrence identity; caseItem.id remains the canonical entity ID. */
    _occurrenceId?: string;
    tasks: Task[];
    subCasesWithTasks: CaseWithTasks[];
}

export interface ContractsWithChildren {
    id: number;
    contract: ContractOur | ContractOther;
    milestonesWithCases: {
        milestone: Milestone;
        _displayContractId?: number;
        _occurrenceId?: string;
        casesWithTasks: CaseWithTasks[];
    }[];
}
