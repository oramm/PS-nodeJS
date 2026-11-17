import BaseRepository from '../../../../repositories/BaseRepository';
import Task from './Task';
import mysql from 'mysql2/promise';
import Project from '../../../../projects/Project';
import { makeProjectScopeCondition } from '../../../../tools/ProjectScope';
import { ProjectScope } from '../../../../types/sessionTypes';
import {
    OfferData,
    OtherContractData,
    OurContractData,
} from '../../../../types/types';
import Milestone from '../../Milestone';
import Case from '../Case';
import Person from '../../../../persons/Person';
import { milestoneVisibilitySql } from '../../sharing/milestoneVisibilitySql';

export interface TasksSearchParams {
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
}

export default class TaskRepository extends BaseRepository<Task> {
    constructor() {
        super('Tasks');
    }

    /** mysql2 zwraca DECIMAL jako string - konwersja na number (NULL zostaje null) */
    static decimalToNumber(value: any): number | null {
        return value === null || value === undefined ? null : Number(value);
    }

    protected mapRowToModel(row: any): Task {
        return new Task({
            id: row.Id,
            name: row.Name,
            description: row.Description,
            deadline: row.Deadline,
            status: row.Status,
            estimatedHours: TaskRepository.decimalToNumber(row.EstimatedHours),
            hoursMon: TaskRepository.decimalToNumber(row.HoursMon),
            hoursTue: TaskRepository.decimalToNumber(row.HoursTue),
            hoursWed: TaskRepository.decimalToNumber(row.HoursWed),
            hoursThu: TaskRepository.decimalToNumber(row.HoursThu),
            hoursFri: TaskRepository.decimalToNumber(row.HoursFri),
            ownerId: row.OwnerId,
            _owner: row.OwnerId ? {
                id: row.OwnerId,
                name: row.OwnerName,
                surname: row.OwnerSurname,
                email: row.OwnerEmail,
            } : undefined,
            _parent: {
                id: row.CaseId,
                milestoneId: row.MilestoneId,
                _parent: {
                    id: row.MilestoneId,
                    contractId: row.ContractId,
                    offerId: row.OfferId,
                    gdFolderId: row.MilestoneGdFolderId,
                    _contract: row.ContractId ? {
                        id: row.ContractId,
                        number: row.ContractNumber,
                        gdFolderId: row.ContractGdFolderId,
                    } : undefined,
                },
            },
        });
    }

    async findById(id: number): Promise<Task | undefined> {
        const rows = await this.executeQuery(mysql.format(
            `SELECT Tasks.*, Tasks.DeadLine AS Deadline, Cases.MilestoneId, Milestones.ContractId, Milestones.OfferId,
                Milestones.GdFolderId AS MilestoneGdFolderId, Contracts.Number AS ContractNumber,
                Contracts.GdFolderId AS ContractGdFolderId,
                Persons.Name AS OwnerName, Persons.Surname AS OwnerSurname, Persons.Email AS OwnerEmail
                FROM Tasks LEFT JOIN Cases ON Cases.Id = Tasks.CaseId
                LEFT JOIN Milestones ON Milestones.Id = Cases.MilestoneId
                LEFT JOIN Contracts ON Contracts.Id = Milestones.ContractId
                LEFT JOIN Persons ON Persons.Id = Tasks.OwnerId WHERE Tasks.Id = ?`, [id]));
        return rows[0] ? this.mapRowToModel(rows[0]) : undefined;
    }

    async find(
        orConditions: TasksSearchParams[] = [],
        milestoneParentType: 'CONTRACT' | 'OFFER' = 'CONTRACT',
        scope?: ProjectScope
    ): Promise<Task[]> {
        {
            const conditions =
                orConditions.length > 0
                    ? this.makeOrGroupsConditions(
                          orConditions,
                          this.makeAndConditions.bind(this)
                      )
                    : '1';

            const milestoneParentTypeCondition =
                milestoneParentType === 'CONTRACT'
                    ? 'Milestones.ContractId IS NOT NULL'
                    : 'Milestones.OfferId IS NOT NULL';

            const sql = `SELECT  
                    Tasks.Id,
                    Tasks.Name,
                    Tasks.Description,
                    Tasks.Deadline,
                    Tasks.Status,
                    Tasks.EstimatedHours,
                    Tasks.HoursMon,
                    Tasks.HoursTue,
                    Tasks.HoursWed,
                    Tasks.HoursThu,
                    Tasks.HoursFri,
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
                WHERE (${conditions})
                AND ${milestoneParentTypeCondition}
                AND ${makeProjectScopeCondition('Contracts.ProjectOurId', scope)}
                ORDER BY Contracts.Id, Milestones.Id, Cases.Id;`;

            const rows = await this.executeQuery(sql);
            return rows.map((row) => this.mapRowToModel(row));
        }
    }

    private makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1';

        const words = searchText.split(' ');
        const conditions = words.map((word) =>
            mysql.format(
                `(Tasks.Name LIKE ${mysql.escape(`%${word}%`)}
                OR Tasks.Description LIKE ${mysql.escape(`%${word}%`)})`
            )
        );
        return conditions.join(' AND ');
    }

    private makeAndConditions(searchParams: TasksSearchParams): string {
        const conditions: string[] = [];

        if (searchParams._project?.ourId) {
            conditions.push(
                mysql.format(`Contracts.ProjectOurId = ?`, [
                    searchParams._project.ourId,
                ])
            );
        }

        if (searchParams._case?.id) {
            conditions.push(
                mysql.format(`Cases.Id = ?`, [searchParams._case.id])
            );
        }

        const contractId =
            searchParams.contractId || searchParams._contract?.id;
        conditions.push(milestoneVisibilitySql({
            contractId,
            statusPattern: searchParams.contractStatusCondition,
        }));

        const milestoneId =
            searchParams._milestone?.id || searchParams.milestoneId;
        if (milestoneId) {
            conditions.push(mysql.format('Milestones.Id = ?', [milestoneId]));
        }

        if (searchParams._owner?.email) {
            conditions.push(
                mysql.format('Owners.Email REGEXP ?', [
                    searchParams._owner.email,
                ])
            );
        }

        if (searchParams.deadlineFrom) {
            conditions.push(
                mysql.format(`Tasks.Deadline >= ?`, [searchParams.deadlineFrom])
            );
        }

        if (searchParams.deadlineTo) {
            conditions.push(
                mysql.format(`Tasks.Deadline <= ?`, [searchParams.deadlineTo])
            );
        }

        if (searchParams.status) {
            conditions.push(
                mysql.format(`Tasks.Status = ?`, [searchParams.status])
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
}
