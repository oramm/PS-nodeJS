import mysql from 'mysql2/promise';
import ToolsDb from "../../../../tools/ToolsDb";
import Case from "../Case";

import Task from "./Task";
import Milestone from '../../Milestone';
import Person from '../../../../persons/Person';
import Project from '../../../../projects/Project';
import Contract from '../../../Contract';

export default class TasksController {
    static async getTasksList(searchParams: {
        _project?: Project,
        _contract?: Contract,
        contractId?: number,
        _milestone?: Milestone,
        milestoneId?: number,
        _case?: Case,
        contractStatusCondition?: string,
        _owner?: Person,
        deadlineFrom?: string,
        deadlineTo?: string,
        searchText?: string,
        status?: string
    } = {}) {
        console.log('TasksController.getTasksList', searchParams);
        const projectOurId = searchParams._project?.ourId;
        const projectCondition = projectOurId
            ? mysql.format(`Contracts.ProjectOurId = ?`, [projectOurId])
            : '1';

        const caseId = searchParams._case?.id;
        const caseCondition = caseId
            ? mysql.format(`Cases.Id = ?`, [caseId])
            : '1';
        const contractId = searchParams.contractId || searchParams._contract?.id;
        const contractCondition = contractId
            ? mysql.format('Contracts.Id = ?', [contractId])
            : '1';
        const milestoneId = searchParams._milestone?.id || searchParams.milestoneId;
        const milestoneCondition = milestoneId
            ? mysql.format('Milestones.Id = ?', [milestoneId])
            : '1';
        const contractStatusCondition = searchParams.contractStatusCondition
            ? mysql.format('Contracts.Status REGEXP ?', [searchParams.contractStatusCondition])
            : '1';
        const ownerCondition = searchParams._owner
            ? mysql.format('Owners.Email REGEXP ?', [searchParams._owner.email])
            : '1';
        const deadlineFromCondition = searchParams.deadlineFrom
            ? mysql.format(`Tasks.Deadline >= ?`, [searchParams.deadlineFrom])
            : '1';
        const deadlineToCondition = searchParams.deadlineTo
            ? mysql.format(`Tasks.Deadline <= ?`, [searchParams.deadlineTo])
            : '1';
        const statusCondition = searchParams.status
            ? mysql.format(`Tasks.Status = ?`, [searchParams.status])
            : '1';

        const searchTextCondition = this.makeSearchTextCondition(searchParams.searchText);

        const sql = `SELECT  Tasks.Id,
              Tasks.Name AS TaskName,
              Tasks.Description AS TaskDescription,
              Tasks.Deadline AS TaskDeadline,
              Tasks.Status AS TaskStatus,
              Tasks.OwnerId,
              Cases.Id AS CaseId,
              Cases.Name AS CaseName,
              Cases.TypeId AS CaseTypeId,
              Cases.GdFolderId AS CaseGdFolderId,
              CaseTypes.Id AS CaseTypeId,
              CaseTypes.Name AS CaseTypeName,
              CaseTypes.IsDefault,
              CaseTypes.IsUniquePerMilestone,
              CaseTypes.MilestoneTypeId,
              CaseTypes.FolderNumber AS CaseTypeFolderNumber,
              Milestones.Id AS MilestoneId,
              Milestones.ContractId,
              Milestones.GdFolderId AS MilestoneGdFolderId,
              MilestoneTypes.Id AS MilestoneTypeId,
              MilestoneTypes.Name AS MilestoneTypeName,
              MilestoneTypes_ContractTypes.FolderNumber AS MilestoneTypeFolderNumber,
              OurContractsData.OurId AS ContractOurId,
              Contracts.Id AS ContractId,
              Contracts.Alias AS ContractAlias,
              Contracts.Number AS ContractNumber,
              Owners.Name AS OwnerName,
              Owners.Surname AS OwnerSurname,
              Owners.Email AS OwnerEmail
            FROM Tasks
            JOIN Cases ON Cases.Id=Tasks.CaseId
            LEFT JOIN CaseTypes ON Cases.typeId=CaseTypes.Id
            JOIN Milestones ON Milestones.Id=Cases.MilestoneId
            JOIN MilestoneTypes ON Milestones.TypeId=MilestoneTypes.Id
            JOIN Contracts ON Milestones.ContractId=Contracts.Id
            LEFT JOIN OurContractsData ON OurContractsData.Id=Contracts.Id
            JOIN MilestoneTypes_ContractTypes ON MilestoneTypes_ContractTypes.MilestoneTypeId=Milestones.TypeId AND MilestoneTypes_ContractTypes.ContractTypeId=Contracts.TypeId
            LEFT JOIN Persons AS Owners ON Owners.Id = Tasks.OwnerId
            WHERE ${contractCondition} 
              AND ${milestoneCondition}
              AND ${caseCondition} 
              AND ${contractStatusCondition} 
              AND ${projectCondition}
              AND ${ownerCondition}
              AND ${deadlineFromCondition}
              AND ${deadlineToCondition}
              AND ${statusCondition}
              AND ${searchTextCondition}
              ORDER BY Contracts.Id, Milestones.Id, Cases.ID`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processTasksResult(result);
    }

    static makeSearchTextCondition(searchText: string | undefined) {
        if (!searchText) return '1'

        const words = searchText.split(' ');
        const conditions = words.map(word =>
            mysql.format(`(Tasks.Name LIKE ? 
                          OR Tasks.Description LIKE ?)`,
                [`%${word}%`, `%${word}%`]));

        const searchTextCondition = conditions.join(' AND ');
        return searchTextCondition;
    }

    static processTasksResult(result: any[]): Task[] {
        let newResult: Task[] = [];

        for (const row of result) {
            const item = new Task({
                id: row.Id,
                name: row.TaskName,
                description: row.TaskDescription,
                deadline: row.TaskDeadline,
                status: row.TaskStatus,
                _owner: {
                    id: (row.OwnerId) ? row.OwnerId : undefined,
                    name: (row.OwnerName) ? row.OwnerName : '',
                    surname: (row.OwnerSurname) ? row.OwnerSurname : '',
                    email: (row.OwnerEmail) ? row.OwnerEmail : ''
                },
                _parent: new Case({
                    id: row.CaseId,
                    name: row.CaseName,
                    gdFolderId: row.CaseGdFolderId,
                    _type: {
                        id: row.CaseTypeId,
                        name: row.CaseTypeName,
                        isDefault: row.IsDefault,
                        isUniquePerMilestone: row.isUniquePerMilestone,
                        milestoneTypeId: row.MilestoneTypeId,
                        folderNumber: row.CaseTypeFolderNumber,
                    },
                    _parent: new Milestone({
                        id: row.MilestoneId,
                        _type: {
                            id: row.MilestoneTypeId,
                            name: row.MilestoneTypeName,
                            _folderNumber: row.MilestoneTypeFolderNumber,
                        },
                        _parent: {
                            ourId: row.ContractOurId,
                            number: row.ContractNumber,
                            alias: row.ContractAlias
                        }
                    }),
                })
            });
            newResult.push(item);
        }
        return newResult;
    }
}