import mysql from 'mysql2/promise';
import ToolsDb from '../../tools/ToolsDb'
import ContractOther from "../ContractOther";
import ContractOur from "../ContractOur";
import Milestone from "./Milestone";

export default class MilestonesController {
    static async getMilestonesList(searchParams: {
        projectId?: string,
        contractId?: number
    } = {}) {
        const projectCondition = searchParams.projectId
            ? mysql.format('Contracts.ProjectOurId = ?', [searchParams.projectId])
            : '1';
        const contractCondition = searchParams.contractId
            ? mysql.format('Milestones.ContractId = ?', [searchParams.contractId])
            : '1';

        const sql = `SELECT  Milestones.Id,
            MilestoneTypes.Id AS TypeId,
            MilestoneTypes.Name AS TypeName,
            MilestoneTypes_ContractTypes.FolderNumber,
            MilestoneTypes_ContractTypes.IsDefault AS TypeIsDefault,
            MilestoneTypes.IsUniquePerContract AS TypeIsUniquePerContract,
            Milestones.Name,
            Milestones.Description,
            Milestones.StartDate,
            Milestones.EndDate,
            Milestones.Status,
            Milestones.GdFolderId,
            OurContractsData.OurId AS ParentOurId,
            OurContractsData.ManagerId AS ParentManagerId,
            OurContractsData.AdminId AS ParentAdminId,
            Contracts.Id AS ParentId,
            Contracts.Number AS ParentNumber,
            Contracts.OurIdRelated AS ParentOurIdRelated,
            ContractTypes.Id AS ContractTypeId,
            ContractTypes.Name AS ContractTypeName,
            ContractTypes.Description AS ContractTypeDescription,
            ContractTypes.IsOur AS ContractTypeIsOur,
            Contracts.ProjectOurId
        FROM Milestones
        JOIN MilestoneTypes ON Milestones.TypeId=MilestoneTypes.Id
        JOIN Contracts ON Milestones.ContractId = Contracts.Id
        LEFT JOIN ContractTypes ON ContractTypes.Id = Contracts.TypeId
        LEFT JOIN MilestoneTypes_ContractTypes ON MilestoneTypes_ContractTypes.MilestoneTypeId=Milestones.TypeId AND MilestoneTypes_ContractTypes.ContractTypeId=Contracts.TypeId
        LEFT JOIN OurContractsData ON OurContractsData.Id=Milestones.ContractId
        WHERE ${projectCondition} 
          AND ${contractCondition}
        ORDER BY MilestoneTypes_ContractTypes.FolderNumber`;

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processMilestonesResult(result);
    }

    static processMilestonesResult(result: any[]): Milestone[] {
        let newResult: Milestone[] = [];

        for (const row of result) {
            const contractInitParam = {
                id: row.ParentId,
                ourId: row.ParentOurId,
                number: row.ParentNumber,
                _ourContract: { ourId: row.ParentOurIdRelated },
                _manager: { id: row.ParentManagerId },
                _admin: { id: row.ParentAdminId },
                projectId: row.ProjectOurId,
                _type: {
                    id: row.ContractTypeId,
                    name: row.ContractTypeName,
                    description: row.ContractTypeDescription,
                    isOur: row.ContractTypeIsOur
                }
            }

            const _contract = contractInitParam.ourId ? new ContractOur(contractInitParam) : new ContractOther(contractInitParam);

            const item = new Milestone({
                id: row.Id,
                _type: {
                    id: row.TypeId,
                    name: row.TypeName,
                    isUniquePerContract: row.TypeIsUniquePerContract,
                    _isDefault: row.TypeIsDefault,
                    _folderNumber: row.FolderNumber,
                },
                name: ToolsDb.sqlToString(row.Name),
                description: ToolsDb.sqlToString(row.Description),
                startDate: row.StartDate,
                endDate: row.EndDate,
                status: row.Status,
                gdFolderId: row.GdFolderId,
                //może to być kontrakt na roboty (wtedy ma _ourContract), albo OurContract(wtedy ma OurId)
                _parent: _contract
            });
            newResult.push(item);
        }
        return newResult;
    }
}