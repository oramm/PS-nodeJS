import mysql from 'mysql2/promise';
import ToolsDb from '../tools/ToolsDb';
import Case from './milestones/cases/Case';

import Task from './milestones/cases/tasks/Task';
import Milestone from './milestones/Milestone';
import Person from '../persons/Person';
import Project from '../projects/Project';
import Contract from './Contract';
import ToolsGd from '../tools/ToolsGd';
import ToolsDate from '../tools/ToolsDate';
import ContractOur from './ContractOur';
import ContractOther from './ContractOther';
import {
    ContractsWithChildren as ContractWithChildren,
    ContractsWithChildren,
} from './ContractTypes';
import Setup from '../setup/Setup';

export type ContractsWithChildrenSearchParams = {
    _project?: Project;
    _contract?: Contract;
    contractId?: number;
    _milestone?: Milestone;
    milestoneId?: number;
    _case?: Case;
    contractStatusCondition?: string;
    _owner?: Person;
    deadlineFrom?: string;
    deadlineTo?: string;
    searchText?: string;
    statusType?: 'active' | 'archived' | 'all';
};

export default class ContractsWithChildrenController {
    static async getContractsList(
        orConditions: ContractsWithChildrenSearchParams[] = []
    ) {
        const sql = `SELECT  Tasks.Id,
                Contracts.Id AS ContractId,
                Contracts.Alias AS ContractAlias,
                Contracts.Number AS ContractNumber,
                Contracts.Name AS ContractName,
                Contracts.Comment AS ContractComment,
                Contracts.StartDate AS ContractStartDate,
                Contracts.EndDate AS ContractEndDate,
                Contracts.Value AS ContractValue,
                Contracts.Status AS ContractStatus,
                Contracts.GdFolderId AS ContractGdFolderId,
                OurContractsData.OurId AS ContractOurId,
                ContractTypes.Id AS ContractTypeId,
                ContractTypes.Name AS ContractTypeName,
                ContractManagers.Id AS ContractManagerId,
                ContractManagers.Name AS ContractManagerName, 
                ContractManagers.Surname AS ContractManagerSurname, 
                ContractManagers.Email AS ContractManagerEmail,
                ContractAdmins.Id AS ContractAdminId,
                ContractAdmins.Name AS ContractAdminName,
                ContractAdmins.Surname AS ContractAdminSurname,
                ContractAdmins.Email AS ContractAdminEmail,      
                Milestones.Id AS MilestoneId,
                Milestones.Name AS MilestoneName,
                Milestones.ContractId,
                Milestones.Status AS MilestoneStatus,
                Milestones.GdFolderId AS MilestoneGdFolderId,
                MilestoneDates.Id AS MilestoneDateId,
                MilestoneDates.StartDate AS MilestoneDateStart,
                MilestoneDates.EndDate AS MilestoneDateEnd,
                MilestoneDates.Description AS MilestoneDateDescription,
                MilestoneDates.LastUpdated AS MilestoneDateLastUpdated,
                MilestoneTypes.Id AS MilestoneTypeId,
                MilestoneTypes.Name AS MilestoneTypeName,
                MilestoneTypes.IsUniquePerContract,
                MilestoneTypes_ContractTypes.FolderNumber AS MilestoneTypeFolderNumber,
                Cases.Id AS CaseId,
                Cases.Name AS CaseName,
                Cases.Description AS CaseDescription,
                Cases.TypeId AS CaseTypeId,
                Cases.GdFolderId AS CaseGdFolderId,
                Cases.Number AS CaseNumber,
                CaseTypes.Id AS CaseTypeId,
                CaseTypes.Name AS CaseTypeName,
                CaseTypes.IsDefault,
                CaseTypes.IsUniquePerMilestone,
                CaseTypes.FolderNumber AS CaseTypeFolderNumber,
                Tasks.Name AS TaskName,
                Tasks.Description AS TaskDescription,
                Tasks.Deadline AS TaskDeadline,
                Tasks.Status AS TaskStatus,
                Tasks.OwnerId,
                TasksOwners.Name AS OwnerName,
                TasksOwners.Surname AS OwnerSurname,
                TasksOwners.Email AS OwnerEmail
            FROM Contracts
            LEFT JOIN ContractTypes ON ContractTypes.Id = Contracts.TypeId
            LEFT JOIN OurContractsData ON OurContractsData.Id=Contracts.Id
            LEFT JOIN Contracts AS relatedContracts ON relatedContracts.Id=(SELECT OurContractsData.Id FROM OurContractsData WHERE OurId=Contracts.OurIdRelated)
            LEFT JOIN Milestones ON Milestones.ContractId=Contracts.Id
            LEFT JOIN Cases ON Cases.MilestoneId=Milestones.Id
            JOIN MilestoneTypes ON Milestones.TypeId=MilestoneTypes.Id
            LEFT JOIN CaseTypes ON Cases.typeId=CaseTypes.Id
            LEFT JOIN Tasks ON Tasks.CaseId=Cases.Id
            LEFT JOIN Persons AS ContractManagers ON OurContractsData.ManagerId = ContractManagers.Id
            LEFT JOIN Persons AS ContractAdmins ON OurContractsData.AdminId = ContractAdmins.Id
            JOIN MilestoneTypes_ContractTypes 
                ON  MilestoneTypes_ContractTypes.MilestoneTypeId=Milestones.TypeId 
                AND MilestoneTypes_ContractTypes.ContractTypeId=Contracts.TypeId 
            LEFT JOIN Persons AS TasksOwners ON TasksOwners.Id = Tasks.OwnerId
            LEFT JOIN MilestoneDates ON MilestoneDates.MilestoneId = Milestones.Id
            WHERE ${ToolsDb.makeOrGroupsConditions(
                orConditions,
                this.makeAndConditions.bind(this)
            )}
            ORDER BY Contracts.Id, MilestoneTypeFolderNumber, CaseTypeFolderNumber, Cases.Id`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processContractsResult(result);
    }

    static makeAndConditions(searchParams: ContractsWithChildrenSearchParams) {
        const projectOurId = searchParams._project?.ourId;
        const projectCondition = projectOurId
            ? mysql.format(`Contracts.ProjectOurId = ?`, [projectOurId])
            : '1';

        const caseId = searchParams._case?.id;
        const caseCondition = caseId
            ? mysql.format(`Cases.Id = ?`, [caseId])
            : '1';
        const contractId =
            searchParams.contractId || searchParams._contract?.id;
        const contractCondition = contractId
            ? mysql.format('Contracts.Id = ?', [contractId])
            : '1';
        const milestoneId =
            searchParams._milestone?.id || searchParams.milestoneId;
        const milestoneCondition = milestoneId
            ? mysql.format('Milestones.Id = ?', [milestoneId])
            : '1';

        let statusTypeCondition;
        switch (searchParams.statusType) {
            case 'active':
                statusTypeCondition = `Contracts.Status NOT REGEXP "${Setup.ContractStatus.ARCHIVAL}"`;
                break;
            case 'archived':
                statusTypeCondition = `Contracts.Status REGEXP "${Setup.ContractStatus.ARCHIVAL}"`;
                break;
            case 'all':
            default:
                statusTypeCondition = '1';
        }
        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );

        return `${contractCondition} 
            AND ${milestoneCondition}
            AND ${caseCondition} 
            AND ${statusTypeCondition} 
            AND ${projectCondition}
            AND ${searchTextCondition}`;
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';

        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(Tasks.Name LIKE ? 
                          OR Tasks.Description LIKE ?)`,
                [`%${word}%`, `%${word}%`]
            )
        );

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static processContractsResult(result: any[]) {
        const contracts: { [id: string]: ContractOur | ContractOther } = {};
        const contractsWithChildren: ContractsWithChildren[] = [];
        // Tworzymy zbiór kamieni milowych, aby uniknąć duplikacji
        const milestonesById: { [id: number]: Milestone } = {};

        for (const row of result) {
            let contract = contracts[row.ContractId];
            if (!contract) {
                const initParams = {
                    id: row.ContractId,
                    ourId: row.ContractOurId,
                    number: row.ContractNumber,
                    name: ToolsDb.sqlToString(row.ContractName),
                    comment: ToolsDb.sqlToString(row.ContractComment),
                    startDate: ToolsDate.dateJsToSql(row.ContractStartDate),
                    endDate: ToolsDate.dateJsToSql(row.ContractEndDate),
                    value: row.ContractValue,
                    status: row.ContractStatus,
                    gdFolderId: row.ContractGdFolderId,
                    _gdFolderUrl: ToolsGd.createGdFolderUrl(
                        row.ContractGdFolderId
                    ),
                    alias: row.ContractAlias,
                    _type: {
                        id: row.ContractTypeId,
                        name: row.ContractTypeName,
                    },
                    _manager: row.ContractManagerEmail
                        ? {
                              id: row.ContractManagerId,
                              name: row.ContractManagerName,
                              surname: row.ContractManagerSurname,
                              email: row.ContractManagerEmail,
                          }
                        : undefined,
                    _admin: row.ContractAdminEmail
                        ? {
                              id: row.ContractAdminId,
                              name: row.ContractAdminName,
                              surname: row.ContractAdminSurname,
                              email: row.ContractAdminEmail,
                          }
                        : undefined,
                    _relatedContracts: [], // Przechowuje związane kontrakty
                };

                contract = row.ContractOurId
                    ? new ContractOur(initParams)
                    : new ContractOther(initParams);
                contracts[row.ContractId] = contract;
            }

            if (!milestonesById[row.MilestoneId])
                milestonesById[row.MilestoneId] = new Milestone({
                    id: row.MilestoneId,
                    name: row.MilestoneName,
                    gdFolderId: row.MilestoneGdFolderId,
                    status: row.MilestoneStatus,
                    _dates: [],
                    _type: {
                        id: row.MilestoneTypeId,
                        name: row.MilestoneTypeName,
                        _folderNumber: row.MilestoneTypeFolderNumber,
                        isUniquePerContract: row.IsUniquePerContract,
                    },
                    _contract: contract,
                });

            const uniqueMilestone = milestonesById[row.MilestoneId];
            if (
                row.MilestoneDateId &&
                !uniqueMilestone._dates.some(
                    (d) => d.id === row.MilestoneDateId
                )
            )
                uniqueMilestone._dates.push({
                    id: row.MilestoneDateId,
                    milestoneId: row.MilestoneId,
                    startDate: row.MilestoneDateStart,
                    endDate: row.MilestoneDateEnd,
                    description: ToolsDb.sqlToString(
                        row.MilestoneDateDescription
                    ),
                    lastUpdated: row.MilestoneDateLastUpdated,
                });

            const caseItem = new Case({
                id: row.CaseId,
                name: ToolsDb.sqlToString(row.CaseName),
                description: ToolsDb.sqlToString(row.CaseDescription),
                number: row.CaseNumber,
                gdFolderId: row.CaseGdFolderId,
                _type: {
                    id: row.CaseTypeId,
                    name: row.CaseTypeName,
                    isDefault: row.IsDefault,
                    isUniquePerMilestone: row.IsUniquePerMilestone,
                    milestoneTypeId: row.MilestoneTypeId,
                    folderNumber: row.CaseTypeFolderNumber,
                },
                _parent: uniqueMilestone,
            });

            const task = new Task({
                id: row.Id,
                name: ToolsDb.sqlToString(row.TaskName),
                description: ToolsDb.sqlToString(row.TaskDescription),
                deadline: row.TaskDeadline,
                status: row.TaskStatus,
                _owner: {
                    id: row.OwnerId ? row.OwnerId : undefined,
                    name: row.OwnerName ? row.OwnerName : '',
                    surname: row.OwnerSurname ? row.OwnerSurname : '',
                    email: row.OwnerEmail ? row.OwnerEmail : '',
                },
                _parent: caseItem,
            });

            // Znajdujemy kontrakt w contractsWitchChildren lub tworzymy nowy, jeśli go nie ma
            let contractWithChildren = contractsWithChildren.find(
                (c) => c.contract.id === contract.id
            );
            if (!contractWithChildren) {
                contractWithChildren = {
                    id: contract.id as number,
                    contract: contract,
                    milestonesWithCases: [],
                };
                contractsWithChildren.push(contractWithChildren);
            }

            // Znajdujemy kamień milowy w kontrakcie lub tworzymy nowy, jeśli go nie ma
            let milestoneWithCases =
                contractWithChildren.milestonesWithCases.find(
                    (m) => m.milestone.id === uniqueMilestone.id
                );
            if (!milestoneWithCases) {
                milestoneWithCases = {
                    milestone: uniqueMilestone,
                    casesWithTasks: [],
                };
                contractWithChildren.milestonesWithCases.push(
                    milestoneWithCases
                );
            }

            if (caseItem.id) {
                // Znajdujemy sprawę w kamieniu milowym lub tworzymy nową, jeśli jej nie ma
                let caseWithTasks = milestoneWithCases.casesWithTasks.find(
                    (c) => c.caseItem.id === caseItem.id
                );
                if (!caseWithTasks) {
                    caseWithTasks = {
                        caseItem: caseItem,
                        tasks: [],
                    };
                    milestoneWithCases.casesWithTasks.push(caseWithTasks);
                }

                // Dodajemy zadanie do sprawy
                if (
                    task.id &&
                    !caseWithTasks.tasks.some((t) => t.id === task.id)
                )
                    caseWithTasks.tasks.push(task);
            }
        }

        return contractsWithChildren;
    }
}
