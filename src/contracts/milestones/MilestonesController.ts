import mysql from "mysql";
import Tools from "../../tools/Tools";
import ToolsDb from '../../tools/ToolsDb'
import Contract from "../Contract";
import ContractOther from "../ContractOther";
import ContractOur from "../ContractOur";
import Milestone from "./Milestone";

export default class MilestonesController {
    static async getMilestonesList(initParamObject: { projectId?: string, contractId?: number }) {
        const projectCondition = (initParamObject && initParamObject.projectId) ? 'Contracts.ProjectOurId="' + initParamObject.projectId + '"' : '1';
        const contractCondition = (initParamObject && initParamObject.contractId) ? 'Milestones.ContractId=' + initParamObject.contractId : '1';

        const sql = 'SELECT  Milestones.Id, \n \t' +
            'MilestoneTypes.Id AS TypeId, \n \t' +
            'MilestoneTypes.Name AS TypeName, \n \t' +
            'MilestoneTypes_ContractTypes.FolderNumber, \n \t' +
            'MilestoneTypes_ContractTypes.IsDefault AS TypeIsDefault, \n \t' +
            'MilestoneTypes.IsUniquePerContract AS TypeIsUniquePerContract, \n \t' +
            'Milestones.Name, \n \t' +
            'Milestones.Description, \n \t' +
            'Milestones.StartDate, \n \t' +
            'Milestones.EndDate, \n \t' +
            'Milestones.Status, \n \t' +
            'Milestones.GdFolderId, \n \t' +
            'OurContractsData.OurId AS ParentOurId, \n \t' +
            'OurContractsData.ManagerId AS ParentManagerId, \n \t' +
            'OurContractsData.AdminId AS ParentAdminId, \n \t' +
            'Contracts.Id AS ParentId, \n \t' +
            'Contracts.Number AS ParentNumber, \n \t' +
            'Contracts.OurIdRelated AS ParentOurIdRelated, \n \t' +
            'ContractTypes.Id AS ContractTypeId, \n \t' +
            'ContractTypes.Name AS ContractTypeName, \n \t' +
            'ContractTypes.Description AS ContractTypeDescription, \n \t' +
            'ContractTypes.IsOur AS ContractTypeIsOur, \n \t' +
            'Contracts.ProjectOurId \n' +
            'FROM Milestones \n' +
            'JOIN MilestoneTypes ON Milestones.TypeId=MilestoneTypes.Id \n' +
            'JOIN Contracts ON Milestones.ContractId = Contracts.Id \n' +
            'LEFT JOIN ContractTypes ON ContractTypes.Id = Contracts.TypeId \n' +
            'LEFT JOIN MilestoneTypes_ContractTypes ON MilestoneTypes_ContractTypes.MilestoneTypeId=Milestones.TypeId AND MilestoneTypes_ContractTypes.ContractTypeId=Contracts.TypeId \n' +
            'LEFT JOIN OurContractsData ON OurContractsData.Id=Milestones.ContractId \n' +
            'WHERE ' + projectCondition + ' AND ' + contractCondition + '\n' +
            'ORDER BY MilestoneTypes_ContractTypes.FolderNumber';

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
                _parent: (row.TypeIsOur) ? new ContractOur(contractInitParam) : new ContractOther(contractInitParam)
            });
            newResult.push(item);
        }
        return newResult;
    }
}