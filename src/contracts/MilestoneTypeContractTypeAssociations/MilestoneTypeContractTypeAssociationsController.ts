import ToolsDb from "../../tools/ToolsDb";
import MilestoneTypeContractType from "./MilestoneTypeContractType";

export default class MilestoneTypeContractTypeAssociationsController {
    static async getMilestoneTypeContractTypeAssociationsList(initParamObject: any) {

        const sql = 'SELECT  MilestoneTypes_ContractTypes.MilestoneTypeId, \n \t' +
            'MilestoneTypes_ContractTypes.ContractTypeId, \n \t' +
            'MilestoneTypes_ContractTypes.FolderNumber, \n \t' +
            'MilestoneTypes_ContractTypes.IsDefault, \n \t' +
            'MilestoneTypes.Name AS "MilestoneTypeName", \n \t' +
            'MilestoneTypes.IsInScrumByDefault, \n \t' +
            'MilestoneTypes.IsUniquePerContract, \n \t' +
            'MilestoneTypes.Description AS "MilestoneTypeDescription", \n \t' +
            'ContractTypes.Name AS "ContractTypeName", \n \t' +
            'ContractTypes.Description AS ContractTypeDescription \n \t' +
            'FROM MilestoneTypes_ContractTypes \n' +
            'JOIN MilestoneTypes ON MilestoneTypes_ContractTypes.MilestoneTypeId = MilestoneTypes.Id \n' +
            'JOIN ContractTypes ON MilestoneTypes_ContractTypes.ContractTypeId = ContractTypes.Id \n' +
            'ORDER BY ContractTypes.Name, MilestoneTypes_ContractTypes.FolderNumber';

        const result: any[] = <any[]>await ToolsDb.getQueryCallbackAsync(sql);
        return this.processMilestoneTypeContractTypeAssociationsResult(result);
    }

    static processMilestoneTypeContractTypeAssociationsResult(result: any[]): [MilestoneTypeContractType?] {
        let newResult: [MilestoneTypeContractType?] = [];

        for (const row of result) {
            const item = new MilestoneTypeContractType({
                _milestoneType: {
                    id: row.MilestoneTypeId,
                    name: row.MilestoneTypeName,
                    description: row.MilestoneTypeDescription,
                    isInScrumByDefault: row.IsInScrumByDefault,
                    isUniquePerContract: row.IsUniquePerContract
                },
                _contractType: {
                    id: row.ContractTypeId,
                    name: row.ContractTypeName,
                    description: row.ContractTypeDescription,
                },
                isDefault: row.IsDefault,
                folderNumber: row.FolderNumber,
                _folderNumber_MilestoneTypeName: `${row.FolderNumber} ${row.MilestoneTypeName}`
            });

            newResult.push(item);
        }
        return newResult;
    }
}