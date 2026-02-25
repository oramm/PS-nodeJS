import mysql from 'mysql2/promise';
import BaseRepository from '../../repositories/BaseRepository';
import ToolsDb from '../../tools/ToolsDb';
import MeetingArrangement from './MeetingArrangement';

export interface MeetingArrangementSearchParams {
    projectOurId?: string;
    contractId?: number;
    meetingId?: number;
    caseId?: number;
    id?: number;
}

export default class MeetingArrangementRepository extends BaseRepository<MeetingArrangement> {
    constructor() {
        super('MeetingArrangements');
    }

    async find(
        params?: MeetingArrangementSearchParams
    ): Promise<MeetingArrangement[]> {
        const projectCondition = params?.projectOurId
            ? `Contracts.ProjectOurId="${params.projectOurId}"`
            : '1';
        const contractCondition = params?.contractId
            ? `Contracts.Id=${params.contractId}`
            : '1';
        const meetingCondition = params?.meetingId
            ? `MeetingArrangements.MeetingId=${params.meetingId}`
            : '1';
        const caseCondition = params?.caseId
            ? `MeetingArrangements.CaseId=${params.caseId}`
            : '1';
        const idCondition = params?.id
            ? `MeetingArrangements.Id=${params.id}`
            : '1';

        const sql = `
            SELECT  
                MeetingArrangements.Id,
                MeetingArrangements.MeetingId,
                MeetingArrangements.Name,
                MeetingArrangements.Description,
                MeetingArrangements.Deadline,
                MeetingArrangements.Status,
                MeetingArrangements.LastUpdated,
                Cases.Id AS CaseId,
                Cases.Name AS CaseName,
                CaseTypes.Id AS CaseTypeId,
                CaseTypes.Name AS CaseTypeName,
                CaseTypes.FolderNumber,
                Milestones.Id AS MilestoneId,
                Milestones.Name AS MilestoneName,
                Contracts.Id AS ContractId,
                Contracts.Number AS ContractNumber,
                Contracts.Name AS ContractName,
                Persons.Id AS OwnerId,
                Persons.Name AS OwnerName,
                Persons.Surname AS OwnerSurname,
                Persons.Email AS OwnerEmail
            FROM MeetingArrangements
            JOIN Cases ON MeetingArrangements.CaseId=Cases.Id
            JOIN CaseTypes ON Cases.TypeId=CaseTypes.Id
            JOIN Milestones ON Cases.MilestoneId=Milestones.Id
            JOIN Contracts ON Milestones.ContractId=Contracts.Id
            LEFT JOIN Persons ON MeetingArrangements.OwnerId=Persons.Id
            WHERE ${projectCondition} 
                AND ${contractCondition} 
                AND ${caseCondition} 
                AND ${meetingCondition}
                AND ${idCondition}`;

        const result = await ToolsDb.getQueryCallbackAsync(sql);
        return this.processResult(result as any[]);
    }

    protected mapRowToModel(row: any): MeetingArrangement {
        return new MeetingArrangement({
            id: row.Id,
            name: row.Name,
            description: row.Description,
            deadline: row.Deadline,
            status: row.Status,
            _lastUpdated: row.LastUpdated,
            _owner: {
                id: row.OwnerId,
                name: row.OwnerName,
                surname: row.OwnerSurname,
                email: row.OwnerEmail,
            },
            _parent: {
                id: row.MeetingId,
            },
            _case: {
                id: row.CaseId,
                name: row.CaseName,
                _type: {
                    id: row.CaseTypeId,
                    name: row.CaseTypeName,
                    folderNumber: row.FolderNumber,
                },
                _parent: {
                    id: row.MilestoneId,
                    name: row.MilestoneName,
                    _parent: {
                        id: row.ContractId,
                        name: row.ContractName,
                        number: row.ContractNumber,
                    },
                },
            },
        });
    }

    private processResult(result: any[]): MeetingArrangement[] {
        return result.map((row) => this.mapRowToModel(row));
    }
}
