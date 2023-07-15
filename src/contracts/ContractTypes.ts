import ContractOther from "./ContractOther"
import ContractOur from "./ContractOur"
import Milestone from "./milestones/Milestone"
import Case from "./milestones/cases/Case"
import Task from "./milestones/cases/tasks/Task"

export interface ContractsWithChildren {
    id: number,
    contract: ContractOur | ContractOther,
    milestonesWithCases: {
        milestone: Milestone,
        casesWithTasks: {
            caseItem: Case,
            tasks: Task[]
        }[]
    }[]
}