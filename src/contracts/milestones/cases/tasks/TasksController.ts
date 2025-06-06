import mysql from 'mysql2/promise';
import ToolsDb from '../../../../tools/ToolsDb';
import Case from '../Case';

import Task from './Task';
import Milestone from '../../Milestone';
import Person from '../../../../persons/Person';
import Project from '../../../../projects/Project';

import ToolsGd from '../../../../tools/ToolsGd';
import ToolsDate from '../../../../tools/ToolsDate';
import {
    OfferData,
    OtherContractData,
    OurContractData,
} from '../../../../types/types';

type TaskSearchParams = {
    _project?: Project;
    _contract?: OurContractData | OtherContractData;
    _offer?: OfferData;
    contractId?: number;
    _milestone?: Milestone;
    milestoneId?: number;
    _case?: Case;
    contractStatusCondition?: string;
    _owner?: Person;
    deadlineFrom?: string;
    deadlineTo?: string;
    searchText?: string;
    status?: string;
};

export default class TasksController {
    static async getTasksList(
        orConditions: TaskSearchParams[] = [],
        milestoneParentType: 'CONTRACT' | 'OFFER' = 'CONTRACT'
    ) {
        const milestoneParentTypeCondition =
            milestoneParentType === 'CONTRACT'
                ? 'Milestones.ContractId IS NOT NULL'
                : 'Milestones.OfferId IS NOT NULL';

        const sql = `SELECT  
                Tasks.Id,
                Tasks.Name AS TaskName,
                Tasks.Description AS TaskDescription,
                Tasks.Deadline AS TaskDeadline,
                Tasks.Status AS TaskStatus,
                Tasks.OwnerId,
                Cases.Id AS CaseId,
                Cases.Name AS CaseName,
                Cases.Description AS CaseDescription,
                Cases.TypeId AS CaseTypeId,
                Cases.GdFolderId AS CaseGdFolderId,
                CaseTypes.Id AS CaseTypeId,
                CaseTypes.Name AS CaseTypeName,
                CaseTypes.IsDefault,
                CaseTypes.IsUniquePerMilestone,
                CaseTypes.MilestoneTypeId,
                CaseTypes.FolderNumber AS CaseTypeFolderNumber,
                Milestones.Id AS MilestoneId,
                Milestones.Name AS MilestoneName,
                Milestones.ContractId,
                Milestones.OfferId,
                Milestones.GdFolderId AS MilestoneGdFolderId,
                MilestoneTypes.Id AS MilestoneTypeId,
                MilestoneTypes.Name AS MilestoneTypeName,
                MilestoneTypes.IsUniquePerContract,
                COALESCE(MilestoneTypes_ContractTypes.FolderNumber, MilestoneTypes_Offers.FolderNumber) AS MilestoneTypeFolderNumber,
                OurContractsData.OurId AS ContractOurId,
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
                ContractTypes.Name AS ContractTypeName,
                ContractManagers.Id AS ContractManagerId,
                ContractManagers.Name AS ContractManagerName, 
                ContractManagers.Surname AS ContractManagerSurname, 
                ContractManagers.Email AS ContractManagerEmail,
                ContractAdmins.Id AS ContractAdminId,
                ContractAdmins.Name AS ContractAdminName,
                ContractAdmins.Surname AS ContractAdminSurname,
                ContractAdmins.Email AS ContractAdminEmail,
                Owners.Name AS OwnerName,
                Owners.Surname AS OwnerSurname,
                Owners.Email AS OwnerEmail
            FROM Tasks
            JOIN Cases ON Tasks.CaseId = Cases.Id
            JOIN Milestones ON Cases.MilestoneId = Milestones.Id
            JOIN MilestoneTypes ON Milestones.TypeId = MilestoneTypes.Id
            LEFT JOIN CaseTypes ON Cases.typeId = CaseTypes.Id
            LEFT JOIN Contracts ON Milestones.ContractId = Contracts.Id
            LEFT JOIN Offers ON Milestones.OfferId = Offers.Id
            LEFT JOIN ContractTypes ON ContractTypes.Id = Contracts.TypeId
            LEFT JOIN OurContractsData ON OurContractsData.Id = Contracts.Id
            LEFT JOIN Contracts AS relatedContracts ON relatedContracts.Id = (SELECT OurContractsData.Id FROM OurContractsData WHERE OurId = Contracts.OurIdRelated)
            LEFT JOIN Persons AS ContractManagers ON OurContractsData.ManagerId = ContractManagers.Id
            LEFT JOIN Persons AS ContractAdmins ON OurContractsData.AdminId = ContractAdmins.Id
            LEFT JOIN MilestoneTypes_ContractTypes 
                ON  MilestoneTypes_ContractTypes.MilestoneTypeId = Milestones.TypeId 
                AND MilestoneTypes_ContractTypes.ContractTypeId = Contracts.TypeId
            LEFT JOIN MilestoneTypes_Offers ON MilestoneTypes_Offers.MilestoneTypeId = Milestones.TypeId
            LEFT JOIN Persons AS Owners ON Owners.Id = Tasks.OwnerId
            WHERE ${ToolsDb.makeOrGroupsConditions(
                orConditions,
                this.makeAndConditions.bind(this)
            )}
                AND ${milestoneParentTypeCondition}
            ORDER BY Contracts.Id, Milestones.Id, Cases.Id;`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processTasksResult(result);
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

    private static makeAndConditions(searchParams: any) {
        const projectOurId = searchParams._project?.ourId;
        const projectCondition = projectOurId
            ? mysql.format(`Contracts.ProjectOurId = ? `, [projectOurId])
            : '1';

        const caseId = searchParams._case?.id;
        const caseCondition = caseId
            ? mysql.format(`Cases.Id = ? `, [caseId])
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
        const contractStatusCondition = searchParams.contractStatusCondition
            ? mysql.format('Contracts.Status REGEXP ?', [
                  searchParams.contractStatusCondition,
              ])
            : '1';
        const ownerCondition = searchParams._owner
            ? mysql.format('Owners.Email REGEXP ?', [searchParams._owner.email])
            : '1';
        const deadlineFromCondition = searchParams.deadlineFrom
            ? mysql.format(`Tasks.Deadline >= ? `, [searchParams.deadlineFrom])
            : '1';
        const deadlineToCondition = searchParams.deadlineTo
            ? mysql.format(`Tasks.Deadline <= ? `, [searchParams.deadlineTo])
            : '1';
        const statusCondition = searchParams.status
            ? mysql.format(`Tasks.Status = ? `, [searchParams.status])
            : '1';

        const searchTextCondition = this.makeSearchTextCondition(
            searchParams.searchText
        );

        const conditions = `${contractCondition} 
            AND ${milestoneCondition}
            AND ${caseCondition} 
            AND ${contractStatusCondition} 
            AND ${projectCondition}
            AND ${ownerCondition}
            AND ${deadlineFromCondition}
            AND ${deadlineToCondition}
            AND ${statusCondition}
            AND ${searchTextCondition} `;

        return conditions;
    }

    static processTasksResult(result: any[]): Task[] {
        let newResult: Task[] = [];

        for (const row of result) {
            const item = new Task({
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
                _parent: new Case({
                    id: row.CaseId,
                    name: ToolsDb.sqlToString(row.CaseName),
                    description: ToolsDb.sqlToString(row.CaseDescription),
                    gdFolderId: row.CaseGdFolderId,
                    _type: {
                        id: row.CaseTypeId,
                        name: row.CaseTypeName,
                        isDefault: row.IsDefault,
                        isUniquePerMilestone: row.IsUniquePerMilestone,
                        milestoneTypeId: row.MilestoneTypeId,
                        folderNumber: row.CaseTypeFolderNumber,
                    },
                    _parent: new Milestone({
                        id: row.MilestoneId,
                        name: row.MilestoneName,
                        gdFolderId: row.MilestoneGdFolderId,
                        _type: {
                            id: row.MilestoneTypeId,
                            name: row.MilestoneTypeName,
                            _folderNumber: row.MilestoneTypeFolderNumber,
                            isUniquePerContract: row.IsUniquePerContract,
                        },
                        _contract: {
                            //Contract
                            id: row.ContractId,
                            ourId: row.ContractOurId,
                            number: row.ContractNumber,
                            name: ToolsDb.sqlToString(row.ContractName),
                            comment: ToolsDb.sqlToString(row.ContractComment),
                            startDate: ToolsDate.dateJsToSql(
                                row.ContractStartDate
                            ),
                            endDate: ToolsDate.dateJsToSql(row.ContractEndDate),
                            value: row.ContractValue,
                            status: row.ContractStatus,
                            gdFolderId: row.ContractGdFolderId,
                            _gdFolderUrl: ToolsGd.createGdFolderUrl(
                                row.ContractGdFolderId
                            ),
                            alias: row.ContractAlias,
                            _type: {
                                name: row.ContractTypeName,
                                isOur: row.ContractOurId ? true : false,
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
                            _project: {},
                        } as OurContractData | OtherContractData,
                        _offer: {
                            id: row.OfferId,
                            status: '',
                            alias: '',
                            _type: { name: '', isOur: false },
                            _city: { code: '', name: '' },
                            bidProcedure: '',
                            isOur: false,
                            form: '',
                        },
                        _dates: [],
                    }),
                }),
            });
            newResult.push(item);
        }
        return newResult;
    }
}
